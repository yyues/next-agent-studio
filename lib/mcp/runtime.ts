import "server-only";

import type { McpServerConfig } from "@/lib/models/mcp-server";

function runtimeConfig() {
  const baseUrl = process.env.MCP_RUNTIME_URL?.trim().replace(/\/$/, "");
  const token = process.env.MCP_RUNTIME_TOKEN?.trim();
  if (!baseUrl || !token) {
    throw new Error("MCP Runtime is not configured.");
  }
  return { baseUrl, token };
}

async function runtimeFetch(path: string, init?: RequestInit) {
  const { baseUrl, token } = runtimeConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `MCP Runtime returned ${response.status}.`);
  }
  return data;
}

export function isMcpRuntimeConfigured() {
  return Boolean(process.env.MCP_RUNTIME_URL?.trim() && process.env.MCP_RUNTIME_TOKEN?.trim());
}

export async function syncMcpRuntimeServer(server: McpServerConfig) {
  if (server.type !== "stdio") return null;
  return runtimeFetch("/v1/servers/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(server),
  });
}

/** Reconnect a stdio server after the Runtime container has restarted. */
export async function ensureMcpRuntimeServer(server: McpServerConfig) {
  if (server.type !== "stdio") return null;
  const data = await runtimeFetch("/v1/servers");
  const servers = Array.isArray(data.servers) ? data.servers : [];
  if (servers.some((item) => item && typeof item === "object" && (item as { serverId?: unknown }).serverId === server.serverId)) {
    return data;
  }
  return syncMcpRuntimeServer(server);
}

export async function inspectMcpRuntimeServer(serverId: string) {
  return runtimeFetch(`/v1/servers/${encodeURIComponent(serverId)}/tools`);
}

export async function invokeMcpRuntimeTool(input: {
  serverId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}) {
  return runtimeFetch(`/v1/servers/${encodeURIComponent(input.serverId)}/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toolName: input.toolName, arguments: input.arguments }),
  });
}
