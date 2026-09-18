import "server-only";
import { createHash } from "crypto";
import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import type { ToolSet } from "ai";
import { connectToMongo } from "@/lib/mongodb";
import {
  McpServerModel,
  toMcpServerConfig,
  type McpServerConfig,
} from "@/lib/models/mcp-server";
import { RoleProfileModel } from "@/lib/models/role-profile";
import { encryptSecretMap } from "@/lib/secret-crypto";
import { GLOBAL_ROLE_ID, GLOBAL_USER_ID, BUILTIN_USER_ID } from "@/lib/scopes";
import { isBuiltinRole, personalRoleClause } from "@/lib/server-settings";
import { findMcpRowsByRefs } from "@/lib/resource-refs";

const CONNECT_TIMEOUT_MS = 8000;
// stdio 型首连较慢(npx 首次运行需下载依赖),放宽超时
const STDIO_CONNECT_TIMEOUT_MS = 60000;
/** 单次 MCP 工具调用超时:超时后向模型返回错误,对话继续而不是卡死 */
const TOOL_CALL_TIMEOUT_MS = 30000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} (timeout ${ms}ms)`)), ms),
    ),
  ]);
}

/**
 * 修复非规范 MCP 网关的兼容问题:
 * 部分网关(如阿里云市场 mcpnacos)在 tools/list 无更多页时返回 nextCursor:""
 * (规范要求此时省略该字段),SDK 分页会把空串当"还有下一页"无限重发请求,
 * 表现为 tools() 永远不 resolve、聊天卡死。这里拦截 JSON 响应剥掉空 nextCursor;
 * SSE 流响应原样透传。
 */
async function sanitizeMcpFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);
  const isToolsList =
    (init?.method ?? "GET").toUpperCase() === "POST" &&
    typeof init?.body === "string" &&
    init.body.includes('"tools/list"');
  if (!isToolsList) return res;
  if (!(res.headers.get("content-type") ?? "").includes("application/json")) {
    return res;
  }
  try {
    const clone = res.clone();
    const json = (await clone.json().catch(() => null)) as {
      result?: { nextCursor?: unknown };
    } | null;
    if (!json?.result || json.result.nextCursor !== "") return res;
    delete json.result.nextCursor;
    return new Response(JSON.stringify(json), {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return res;
  }
}

/** 连接目标:http 型(url+headers)或 stdio 型(command+args+env) */
type McpConnectTarget = {
  type?: "http" | "stdio";
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
};

/** upsert 载荷(角色端与管理端共用) */
export type McpUpsertPayload = McpConnectTarget & {
  serverId?: string;
  name: string;
  headers?: Record<string, string>;
  enabled?: boolean;
};

export type McpServerSummary = {
  serverId: string;
  name: string;
  toolNames: string[];
  instructions?: string;
};

export type McpToolBundle = {
  /** 前缀化后的工具集合,可直接合并进 streamText.tools */
  tools: ToolSet;
  /** 已成功连接的 server 摘要,用于注入 system prompt */
  serverSummaries: McpServerSummary[];
  /** 请求结束后调用,关闭所有连接 */
  close: () => Promise<void>;
};

/** 带 source/ref 标注的有效 MCP(供列表/勾选 UI 区分来源) */
export type EffectiveMcpServer = McpServerConfig & {
  /** own=本角色私有;global=全局库;role=自己其他角色引用 */
  source: "own" | "global" | "role";
  /** 引用键(`${srcRoleId}/${serverId}`);own 为 null */
  ref: string | null;
};

export async function listMcpServers(
  userId: string,
  roleId: string,
): Promise<McpServerConfig[]> {
  await connectToMongo();
  const docs = await McpServerModel.find({ userId, roleId }).lean();
  return docs
    .map((doc) => toMcpServerConfig(doc as Record<string, unknown>))
    .sort((a, b) => a.serverId.localeCompare(b.serverId));
}

/**
 * 角色有效 MCP:自己的({userId,roleId} 行) + mcpRefs 引用解析
 * (全局库/自己其他角色) + 内置角色自动包含全局库。
 * 按 serverId 去重,自己的优先。读取失败静默降级(引用目标消失即失效)。
 */
export async function listEffectiveMcpServers(
  userId: string,
  roleId: string,
): Promise<EffectiveMcpServer[]> {
  await connectToMongo();

  const roleDoc = await RoleProfileModel.findOne({
    roleId,
    $or: [
      personalRoleClause(userId),
      { userId: BUILTIN_USER_ID },
      { visibility: "public" },
    ],
  })
    .select("mcpRefs")
    .lean();
  const refs = Array.isArray(roleDoc?.mcpRefs)
    ? roleDoc.mcpRefs.map(String)
    : [];

  const [ownDocs, refRows, globalRows] = await Promise.all([
    McpServerModel.find({ userId, roleId, scope: "role" })
      .lean()
      .catch(() => []),
    refs.length > 0
      ? findMcpRowsByRefs(userId, refs).catch(() => [])
      : Promise.resolve([] as Array<Record<string, unknown>>),
    isBuiltinRole(roleId)
      ? McpServerModel.find({ scope: "global" })
          .lean()
          .catch(() => [])
      : Promise.resolve([] as Array<Record<string, unknown>>),
  ]);

  const seen = new Set<string>();
  const merged: EffectiveMcpServer[] = [];
  for (const doc of [
    ...ownDocs.map((d) => ({ doc: d, source: "own" as const, ref: null })),
    ...refRows.map((d) => ({
      doc: d,
      source: (d.scope === "global" ? "global" : "role") as
        | "global"
        | "role",
      ref: `${String(d.roleId)}/${String(d.serverId)}`,
    })),
    ...globalRows.map((d) => ({
      doc: d,
      source: "global" as const,
      ref: `${GLOBAL_ROLE_ID}/${String(d.serverId)}`,
    })),
  ]) {
    const config = toMcpServerConfig(doc.doc as Record<string, unknown>);
    if (seen.has(config.serverId)) continue;
    seen.add(config.serverId);
    merged.push({ ...config, source: doc.source, ref: doc.ref });
  }
  return merged.sort((a, b) => a.serverId.localeCompare(b.serverId));
}

/* ---------- 全局库 CRUD(仅 /api/admin 路由调用) ---------- */

export async function listGlobalMcpServers(): Promise<McpServerConfig[]> {
  await connectToMongo();
  const docs = await McpServerModel.find({ scope: "global" }).lean();
  return docs
    .map((doc) => toMcpServerConfig(doc as Record<string, unknown>))
    .sort((a, b) => a.serverId.localeCompare(b.serverId));
}

/**
 * upsert 载荷校验与归一:
 * - http 型要求合法 http(s) URL
 * - stdio 型要求非空 command;args 过滤空串
 * - headers/env 只收非空字符串键值
 */
function normalizeMcpUpsert(payload: McpUpsertPayload) {
  const name = (payload.name ?? "").trim();
  if (!name) throw new Error("name is required.");

  const type: "http" | "stdio" =
    payload.type === "stdio" || (!payload.type && !payload.url?.trim() && !!payload.command?.trim())
      ? "stdio"
      : "http";
  const url = (payload.url ?? "").trim();
  const command = (payload.command ?? "").trim();
  const args = (payload.args ?? [])
    .map((a) => String(a).trim())
    .filter((a) => a.length > 0);

  if (type === "http" && !/^https?:\/\//i.test(url)) {
    throw new Error("url must be a valid http(s) URL.");
  }
  if (type === "stdio" && !command) {
    throw new Error("command is required for stdio MCP server.");
  }
  // Windows 下命令/参数含换行会导致 spawn 失败,提前拦截
  if (
    type === "stdio" &&
    process.platform === "win32" &&
    [command, ...args].some((v) => /[\r\n]/.test(v))
  ) {
    throw new Error("command and args must not contain line breaks.");
  }

  const pickSecrets = (value: Record<string, string> | undefined) =>
    Object.fromEntries(
      Object.entries(value ?? {}).filter(
        ([k, v]) => k.trim() && typeof v === "string" && v.trim(),
      ),
    );

  return {
    type,
    name,
    url,
    command,
    args,
    headers: pickSecrets(payload.headers),
    env: pickSecrets(payload.env),
  };
}

export async function upsertGlobalMcpServer(
  payload: McpUpsertPayload,
): Promise<McpServerConfig> {
  await connectToMongo();

  const serverId =
    payload.serverId?.trim() ||
    payload.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") ||
    `mcp-${Date.now()}`;

  const normalized = normalizeMcpUpsert(payload);

  const existing = await McpServerModel.findOne({
    scope: "global",
    serverId,
  }).lean();
  const prev = existing
    ? toMcpServerConfig(existing as Record<string, unknown>)
    : null;

  // headers/env 未提供时保留库中已有值(如 enabled 切换只传部分字段)
  const headers =
    payload.headers !== undefined ? normalized.headers : (prev?.headers ?? {});
  const env = payload.env !== undefined ? normalized.env : (prev?.env ?? {});

  const doc = await McpServerModel.findOneAndUpdate(
    { userId: GLOBAL_USER_ID, roleId: GLOBAL_ROLE_ID, serverId },
    {
      userId: GLOBAL_USER_ID,
      roleId: GLOBAL_ROLE_ID,
      serverId,
      name: normalized.name,
      type: normalized.type,
      url: normalized.type === "http" ? normalized.url : "",
      headers: encryptSecretMap(headers),
      command: normalized.type === "stdio" ? normalized.command : "",
      args: normalized.type === "stdio" ? normalized.args : [],
      env: encryptSecretMap(env),
      enabled: payload.enabled ?? true,
      scope: "global",
    },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
  ).lean();

  if (!doc) throw new Error("Failed to save MCP server.");
  return toMcpServerConfig(doc as Record<string, unknown>);
}

export async function deleteGlobalMcpServer(serverId: string) {
  await connectToMongo();
  const result = await McpServerModel.deleteOne({
    scope: "global",
    serverId,
  });
  if (result.deletedCount === 0) throw new Error("MCP server not found.");
  return { deleted: true };
}

export async function upsertMcpServer(
  userId: string,
  roleId: string,
  payload: McpUpsertPayload,
): Promise<McpServerConfig> {
  await connectToMongo();

  const serverId =
    payload.serverId?.trim() ||
    payload.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") ||
    `mcp-${Date.now()}`;

  const normalized = normalizeMcpUpsert(payload);

  const existing = await McpServerModel.findOne({
    userId,
    roleId,
    serverId,
  }).lean();
  const prev = existing
    ? toMcpServerConfig(existing as Record<string, unknown>)
    : null;

  // headers/env 未提供时保留库中已有值(如 enabled 切换只传部分字段)
  const headers =
    payload.headers !== undefined ? normalized.headers : (prev?.headers ?? {});
  const env = payload.env !== undefined ? normalized.env : (prev?.env ?? {});

  const doc = await McpServerModel.findOneAndUpdate(
    { userId, roleId, serverId },
    {
      userId,
      roleId,
      serverId,
      name: normalized.name,
      type: normalized.type,
      url: normalized.type === "http" ? normalized.url : "",
      headers: encryptSecretMap(headers),
      command: normalized.type === "stdio" ? normalized.command : "",
      args: normalized.type === "stdio" ? normalized.args : [],
      env: encryptSecretMap(env),
      enabled: payload.enabled ?? true,
    },
    { returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
  ).lean();

  if (!doc) throw new Error("Failed to save MCP server.");
  return toMcpServerConfig(doc as Record<string, unknown>);
}

export async function deleteMcpServer(
  userId: string,
  roleId: string,
  serverId: string,
) {
  await connectToMongo();
  const result = await McpServerModel.deleteOne({ userId, roleId, serverId });
  if (result.deletedCount === 0) throw new Error("MCP server not found.");
  return { deleted: true };
}

/** 尝试连接并列出工具名,用于配置页连通性测试 */
export async function testMcpServer(
  input: McpConnectTarget,
): Promise<{ ok: true; toolNames: string[]; serverName?: string }> {
  const { client, toolNames, serverName } = await connectSingle(input);
  try {
    return { ok: true, toolNames, serverName };
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function connectSingle(server: McpConnectTarget) {
  const isStdio =
    server.type === "stdio" ||
    (!server.url?.trim() && !!server.command?.trim());
  const timeoutMs = isStdio ? STDIO_CONNECT_TIMEOUT_MS : CONNECT_TIMEOUT_MS;

  const client = await Promise.race([
    isStdio
      ? createMCPClient({
          // 服务端 spawn 子进程(cross-spawn,兼容 Windows npx.cmd);
          // argv 直传不走 shell;env 与 PATH/HOME 等关键变量合并
          transport: new Experimental_StdioMCPTransport({
            command: server.command?.trim() ?? "",
            args: server.args ?? [],
            env:
              server.env && Object.keys(server.env).length > 0
                ? server.env
                : undefined,
          }),
          onUncaughtError: (error) =>
            console.warn("[mcp] stdio transport error:", String(error)),
        })
      : (() => {
          const url = server.url?.trim() ?? "";
          const isSse = /\/sse\/?$/i.test(url);
          return createMCPClient({
            transport: {
              type: isSse ? "sse" : "http",
              url,
              headers: Object.keys(server.headers ?? {}).length
                ? server.headers
                : undefined,
              // 剥掉非规范网关返回的空 nextCursor,避免 tools/list 无限重发
              fetch: sanitizeMcpFetch,
            },
          });
        })(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `MCP connect timeout: ${isStdio ? `${server.command}` : `${server.url}`}`,
            ),
          ),
        timeoutMs,
      ),
    ),
  ]);

  // tools() 无内建超时,非规范网关(空 nextCursor 分页等)会永久挂起,这里逐出
  let tools;
  try {
    tools = await withTimeout(
      client.tools(),
      timeoutMs,
      `MCP tools/list timeout: ${isStdio ? `${server.command}` : `${server.url}`}`,
    );
  } catch (e) {
    await client.close().catch(() => undefined);
    throw e;
  }
  return {
    client,
    tools,
    toolNames: Object.keys(tools),
    serverName: client.serverInfo?.name,
  };
}

/**
 * 按角色 + 前端勾选的 serverId 列表加载 MCP 工具。
 * mentions 为消息中 @name 匹配到的 server(强制启用)。
 * 单个 server 失败仅跳过,不阻断对话。
 */
export async function loadMcpToolsForChat(input: {
  userId: string;
  roleId: string;
  /** 对话面板勾选的 serverId;undefined 表示用角色下所有 enabled 的 */
  enabledServerIds?: string[];
  /** 消息中 @name 提到的 server 名,强制启用(即使未勾选) */
  mentionNames?: string[];
}): Promise<McpToolBundle> {
  const servers = (await listEffectiveMcpServers(input.userId, input.roleId).catch(
    () => [] as EffectiveMcpServer[],
  )) as McpServerConfig[];
  if (servers.length === 0) {
    return { tools: {}, serverSummaries: [], close: async () => undefined };
  }

  const mentionSet = new Set(
    (input.mentionNames ?? []).map((n) => n.toLowerCase()),
  );
  const selectedSet =
    input.enabledServerIds === undefined
      ? null
      : new Set(input.enabledServerIds);

  const targets = servers.filter((server) => {
    // @提及 按 name 或 serverId 匹配(名称含空格/中文时 serverId 更稳)
    if (
      mentionSet.has(server.name.toLowerCase()) ||
      mentionSet.has(server.serverId.toLowerCase())
    ) {
      return true;
    }
    if (!server.enabled) return false;
    if (selectedSet === null) return true;
    return selectedSet.has(server.serverId);
  });

  if (targets.length === 0) {
    return { tools: {}, serverSummaries: [], close: async () => undefined };
  }

  const clients: MCPClient[] = [];
  const results = await Promise.allSettled(
    targets.map(async (server) => {
      const connected = await connectSingle(server);
      clients.push(connected.client);
      return { server, ...connected };
    }),
  );

  const tools: ToolSet = {};
  const serverSummaries: McpServerSummary[] = [];

  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("[mcp] server failed:", String(result.reason));
      continue;
    }
    const { server, tools: serverTools, toolNames } = result.value;
    for (const [toolName, tool] of Object.entries(serverTools)) {
      // 包一层调用超时:网关挂起时向模型返回错误,对话继续而不是无限等待
      const raw = tool as unknown as {
        execute?: (args: unknown, opts: unknown) => Promise<unknown>;
        description?: string;
      };
      if (typeof raw.execute === "function") {
        const orig = raw.execute.bind(tool);
        raw.execute = (args, opts) =>
          withTimeout(
            orig(args, opts),
            TOOL_CALL_TIMEOUT_MS,
            `MCP tool call timeout: ${server.serverId}/${toolName}`,
          );
      }
      // 模型侧工具名必须匹配 ^[a-zA-Z0-9_-]+$(OpenAI 兼容接口强校验);
      // 中文等非 ASCII 工具名(如阿里云市场网关)替换为短哈希,
      // 原名并入描述让模型仍能理解用途。执行走工具对象内部绑定,不受改名影响。
      let modelFacingName = toolName;
      if (!/^[a-zA-Z0-9_-]+$/.test(toolName)) {
        modelFacingName = `t_${createHash("md5")
          .update(toolName)
          .digest("hex")
          .slice(0, 8)}`;
        const desc = typeof raw.description === "string" ? raw.description : "";
        raw.description = `[${toolName}] ${desc}`.trim();
      }
      // as 断言:FlexibleSchema<unknown> 与 ToolSet 条目的 never 泛型存在方差不兼容,运行时无差异
      tools[`mcp__${server.serverId}__${modelFacingName}`] =
        tool as (typeof tools)[string];
    }
    serverSummaries.push({
      serverId: server.serverId,
      name: server.name,
      toolNames,
    });
  }

  return {
    tools,
    serverSummaries,
    close: async () => {
      await Promise.allSettled(clients.map((client) => client.close()));
    },
  };
}

/** 从消息文本中提取 @提及的名称(支持空格/逗号分隔,中文/英文均可) */
export function extractMcpMentions(text: string): string[] {
  const matches = text.matchAll(/@([\w\u4e00-\u9fa5][\w\u4e00-\u9fa5-]*)/g);
  return Array.from(matches, (m) => m[1]);
}
