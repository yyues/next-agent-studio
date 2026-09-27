import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { validateServerConfig, type RuntimeServerConfig } from "./config.js";

type ManagedServer = {
  config: RuntimeServerConfig;
  client: Client;
  transport: StdioClientTransport;
  tools: Tool[];
  connectedAt: string;
};

export class RuntimeRegistry {
  private readonly servers = new Map<string, ManagedServer>();

  async sync(input: unknown): Promise<{ serverId: string; tools: Tool[] }> {
    const config = validateServerConfig(input);
    await this.remove(config.serverId);

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { ...process.env, ...config.env } as Record<string, string>,
      cwd: config.cwd,
      stderr: "pipe",
    });
    transport.stderr?.on("data", (chunk) => {
      process.stderr.write(`[mcp:${config.serverId}] ${String(chunk)}`);
    });

    const client = new Client(
      { name: "agent-studio-mcp-runtime", version: "0.1.0" },
      { capabilities: {} },
    );
    await client.connect(transport);
    const result = await client.listTools();
    const managed: ManagedServer = {
      config,
      client,
      transport,
      tools: result.tools,
      connectedAt: new Date().toISOString(),
    };
    this.servers.set(config.serverId, managed);
    return { serverId: config.serverId, tools: result.tools };
  }

  async remove(serverId: string) {
    const managed = this.servers.get(serverId);
    if (!managed) return;
    this.servers.delete(serverId);
    await managed.client.close().catch(() => undefined);
    await managed.transport.close().catch(() => undefined);
  }

  async close() {
    await Promise.all([...this.servers.keys()].map((serverId) => this.remove(serverId)));
  }

  list() {
    return [...this.servers.values()].map(({ config, tools, connectedAt, transport }) => ({
      serverId: config.serverId,
      name: config.name,
      command: config.command,
      args: config.args,
      pid: transport.pid,
      connectedAt,
      tools,
    }));
  }

  getTools() {
    return [...this.servers.values()].flatMap((managed) =>
      managed.tools.map((tool) => ({
        ...tool,
        name: `${managed.config.serverId}__${tool.name}`,
        description: `[${managed.config.name}] ${tool.description ?? ""}`.trim(),
        _runtimeServerId: managed.config.serverId,
        _runtimeToolName: tool.name,
      })),
    );
  }

  async callTool(serverId: string, toolName: string, args: Record<string, unknown>) {
    const managed = this.servers.get(serverId);
    if (!managed) throw new Error(`MCP server not found: ${serverId}`);
    const tool = managed.tools.find((item) => item.name === toolName);
    if (!tool) throw new Error(`MCP tool not found: ${serverId}/${toolName}`);
    return managed.client.callTool({ name: tool.name, arguments: args });
  }
}
