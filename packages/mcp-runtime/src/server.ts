import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./mcp-server.js";
import { RuntimeRegistry } from "./registry.js";

const port = Number(process.env.PORT ?? 8080);
const runtimeToken = process.env.MCP_RUNTIME_TOKEN?.trim();
const registry = new RuntimeRegistry();

function authorized(req: IncomingMessage) {
  if (!runtimeToken) return process.env.NODE_ENV !== "production";
  return req.headers.authorization === `Bearer ${runtimeToken}`;
}

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function handleMcp(req: IncomingMessage, res: ServerResponse) {
  const body = req.method === "POST" ? await readJson(req) : undefined;
  const server = createMcpServer(registry);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

const httpServer = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname === "/health" && req.method === "GET") {
      json(res, 200, { ok: true, servers: registry.list().length });
      return;
    }
    if (!authorized(req)) {
      json(res, 401, { error: "Unauthorized" });
      return;
    }
    if (url.pathname === "/v1/servers" && req.method === "GET") {
      json(res, 200, { servers: registry.list() });
      return;
    }
    if (url.pathname === "/v1/servers/sync" && req.method === "POST") {
      json(res, 200, await registry.sync(await readJson(req)));
      return;
    }
    const serverToolsMatch = url.pathname.match(/^\/v1\/servers\/([^/]+)\/tools$/);
    if (serverToolsMatch && req.method === "GET") {
      const server = registry.list().find((item) => item.serverId === decodeURIComponent(serverToolsMatch[1]));
      if (!server) return json(res, 404, { error: "MCP server not found" });
      json(res, 200, { tools: server.tools });
      return;
    }
    const serverInvokeMatch = url.pathname.match(/^\/v1\/servers\/([^/]+)\/invoke$/);
    if (serverInvokeMatch && req.method === "POST") {
      const body = (await readJson(req)) as { toolName?: string; arguments?: Record<string, unknown> };
      if (!body.toolName) return json(res, 400, { error: "toolName is required" });
      const result = await registry.callTool(
        decodeURIComponent(serverInvokeMatch[1]),
        body.toolName,
        body.arguments ?? {},
      );
      json(res, 200, { status: "success", result });
      return;
    }
    if (url.pathname === "/v1/servers" && req.method === "DELETE") {
      const body = (await readJson(req)) as { serverId?: string };
      if (!body.serverId) return json(res, 400, { error: "serverId is required" });
      await registry.remove(body.serverId);
      json(res, 200, { deleted: true });
      return;
    }
    if (url.pathname === "/mcp" && (req.method === "POST" || req.method === "GET")) {
      await handleMcp(req, res);
      return;
    }
    json(res, 404, { error: "Not found" });
  } catch (error) {
    console.error("[mcp-runtime] request failed", error);
    if (!res.headersSent) json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

httpServer.listen(port, () => {
  console.log(`[mcp-runtime] listening on http://localhost:${port}`);
});

process.once("SIGINT", () => void registry.close().finally(() => httpServer.close()));
process.once("SIGTERM", () => void registry.close().finally(() => httpServer.close()));
