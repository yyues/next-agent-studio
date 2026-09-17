import "server-only";
import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";
import { connectToMongo } from "@/lib/mongodb";
import {
  McpServerModel,
  toMcpServerConfig,
  type McpServerConfig,
} from "@/lib/models/mcp-server";
import { encryptSecretMap } from "@/lib/secret-crypto";

const CONNECT_TIMEOUT_MS = 8000;

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

export async function upsertMcpServer(
  userId: string,
  roleId: string,
  payload: {
    serverId?: string;
    name: string;
    url: string;
    headers?: Record<string, string>;
    enabled?: boolean;
  },
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

  if (!payload.name.trim()) throw new Error("name is required.");
  if (!/^https?:\/\//i.test(payload.url.trim())) {
    throw new Error("url must be a valid http(s) URL.");
  }

  // headers 未提供时保留库中已有值(如 enabled 切换只传部分字段)
  const existing = await McpServerModel.findOne({
    userId,
    roleId,
    serverId,
  }).lean();
  const prevHeaders =
    existing ?
      toMcpServerConfig(existing as Record<string, unknown>).headers
    : {};

  const headers = Object.fromEntries(
    Object.entries(payload.headers ?? prevHeaders).filter(
      ([k, v]) => k.trim() && typeof v === "string" && v.trim(),
    ),
  );

  const doc = await McpServerModel.findOneAndUpdate(
    { userId, roleId, serverId },
    {
      userId,
      roleId,
      serverId,
      name: payload.name.trim(),
      url: payload.url.trim(),
      // 请求头值加密落库(幂等:已加密值原样保留)
      headers: encryptSecretMap(headers),
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
export async function testMcpServer(input: {
  url: string;
  headers?: Record<string, string>;
}): Promise<{ ok: true; toolNames: string[]; serverName?: string }> {
  const { client, toolNames, serverName } = await connectSingle(input);
  try {
    return { ok: true, toolNames, serverName };
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function connectSingle(input: { url: string; headers?: Record<string, string> }) {
  const isSse = /\/sse\/?$/i.test(input.url);
  const client = await Promise.race([
    createMCPClient({
      transport: {
        type: isSse ? "sse" : "http",
        url: input.url,
        headers: Object.keys(input.headers ?? {}).length
          ? input.headers
          : undefined,
      },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`MCP connect timeout: ${input.url}`)),
        CONNECT_TIMEOUT_MS,
      ),
    ),
  ]);

  const tools = await client.tools();
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
  const servers = await listMcpServers(input.userId, input.roleId).catch(
    () => [] as McpServerConfig[],
  );
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
    if (mentionSet.has(server.name.toLowerCase())) return true;
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
      const connected = await connectSingle({
        url: server.url,
        headers: server.headers,
      });
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
      // as 断言:FlexibleSchema<unknown> 与 ToolSet 条目的 never 泛型存在方差不兼容,运行时无差异
      tools[`mcp__${server.serverId}__${toolName}`] =
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
