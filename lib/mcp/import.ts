/**
 * 标准 mcpServers JSON 配置的导入解析(纯函数,客户端/服务端通用)。
 *
 * 目标格式(Claude Desktop / Claude Code / Cursor 等复制的配置):
 * {
 *   "mcpServers": {
 *     "weather": {
 *       "command": "npx",
 *       "args": ["-y", "mcp-remote", "https://example.com/mcp"]
 *     }
 *   }
 * }
 *
 * 转换规则:
 * - url 字段直接导入(可带 headers 对象)
 * - command 型若为 `mcp-remote <url>` 包装,提取远程 URL 导入(免起桥接进程)
 * - 其余 command 型(stdio)原样导入 command/args/env,由服务端 spawn 子进程
 */

export type McpImportOrigin = "url" | "mcp-remote" | "stdio";

export type McpImportEntry = {
  name: string;
  /** 远程 URL(http/stdio 二选一) */
  url: string;
  headers: Record<string, string>;
  /** stdio 型命令(如 npx / node / uvx) */
  command: string;
  args: string[];
  /** stdio 型环境变量 */
  env: Record<string, string>;
  origin: McpImportOrigin;
};

export type McpImportSkipped = {
  name: string;
  reason: string;
};

export type McpImportParseResult = {
  entries: McpImportEntry[];
  skipped: McpImportSkipped[];
};

type ServerDef = {
  url?: unknown;
  headers?: unknown;
  command?: unknown;
  args?: unknown;
  env?: unknown;
};

const HTTP_URL_RE = /^https?:\/\//i;

function isServerDef(value: unknown): value is ServerDef {
  return (
    typeof value === "object" &&
    value !== null &&
    ("url" in value || "command" in value)
  );
}

/** headers/env 只收字符串键值 */
function pickStringMap(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null) return {};
  const map: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && k.trim() && v.trim()) {
      map[k.trim()] = v;
    }
  }
  return map;
}

/** mcp-remote 参数串中提取远程 URL 与 --header "Key: Value" */
function fromMcpRemoteArgs(
  args: unknown,
): { url: string; headers: Record<string, string> } | null {
  if (!Array.isArray(args)) return null;
  const remoteIdx = args.findIndex((a) => typeof a === "string" && a === "mcp-remote");
  if (remoteIdx === -1) return null;

  const rest = args.slice(remoteIdx + 1).map((a) => String(a));
  const url = rest.find((a) => HTTP_URL_RE.test(a));
  if (!url) return null;

  const headers: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] !== "--header" && rest[i] !== "--headers") continue;
    const raw = rest[i + 1];
    if (raw === undefined) break;
    const idx = raw.indexOf(":");
    if (idx <= 0) continue;
    const key = raw.slice(0, idx).trim();
    const value = raw.slice(idx + 1).trim();
    if (key && value) headers[key] = value;
  }
  return { url, headers };
}

/**
 * 解析粘贴的 JSON 文本。JSON 非法时抛出友好错误,由调用方展示;
 * 根对象缺 mcpServers 包装时,若值形如 server 定义则把根对象当 map 容错。
 */
export function parseMcpServersJson(text: string): McpImportParseResult {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("empty");

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("invalid-json");
  }
  if (typeof parsed !== "object" || parsed === null) throw new Error("invalid-json");

  let map = (parsed as Record<string, unknown>).mcpServers;
  if (typeof map !== "object" || map === null || Array.isArray(map)) {
    // 容错:直接粘贴单个 server 的 map(无 mcpServers 包装)
    const values = Object.values(parsed as Record<string, unknown>);
    if (values.length > 0 && values.every(isServerDef)) {
      map = parsed;
    } else {
      throw new Error("no-mcp-servers");
    }
  }

  const entries: McpImportEntry[] = [];
  const skipped: McpImportSkipped[] = [];
  const seen = new Set<string>();

  for (const [name, def] of Object.entries(map as Record<string, unknown>)) {
    const key = name.trim() || `mcp-${entries.length + skipped.length + 1}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (!isServerDef(def)) {
      skipped.push({ name: key, reason: "invalid-def" });
      continue;
    }

    if (typeof def.url === "string" && HTTP_URL_RE.test(def.url.trim())) {
      entries.push({
        name: key,
        url: def.url.trim(),
        headers: pickStringMap(def.headers),
        command: "",
        args: [],
        env: {},
        origin: "url",
      });
      continue;
    }

    const remote = fromMcpRemoteArgs(def.args);
    if (remote) {
      entries.push({
        name: key,
        url: remote.url,
        headers: remote.headers,
        command: "",
        args: [],
        env: {},
        origin: "mcp-remote",
      });
      continue;
    }

    if (typeof def.command === "string" && def.command.trim()) {
      entries.push({
        name: key,
        url: "",
        headers: {},
        command: def.command.trim(),
        args: Array.isArray(def.args)
          ? def.args.map((a) => String(a)).filter((a) => a.trim())
          : [],
        env: pickStringMap(def.env),
        origin: "stdio",
      });
      continue;
    }

    skipped.push({ name: key, reason: "invalid-def" });
  }

  return { entries, skipped };
}
