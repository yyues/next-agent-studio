import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { RuntimeRegistry } from "./registry.js";

export function createMcpServer(registry: RuntimeRegistry) {
  const server = new Server(
    { name: "agent-studio-mcp-runtime", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.getTools().map(({ _runtimeServerId: _serverId, _runtimeToolName: _toolName, ...tool }) => tool),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const separator = name.indexOf("__");
    if (separator <= 0) throw new Error(`Invalid runtime tool name: ${name}`);
    const serverId = name.slice(0, separator);
    const toolName = name.slice(separator + 2);
    return registry.callTool(serverId, toolName, request.params.arguments ?? {});
  });

  return server;
}
