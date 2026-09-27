export type RuntimeServerConfig = {
  serverId: string;
  name?: string;
  type: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
};

const allowedCommands = new Set(
  (process.env.MCP_RUNTIME_ALLOWED_COMMANDS ?? "npx,node,python,python3").split(",").map(
    (value) => value.trim(),
  ),
);

export function validateServerConfig(input: unknown): RuntimeServerConfig {
  if (!input || typeof input !== "object") throw new Error("Invalid server configuration.");
  const value = input as Record<string, unknown>;
  const serverId = typeof value.serverId === "string" ? value.serverId.trim() : "";
  const command = typeof value.command === "string" ? value.command.trim() : "";
  if (!serverId || !/^[a-zA-Z0-9_-]{1,80}$/.test(serverId)) {
    throw new Error("serverId must contain only letters, numbers, '_' or '-'.");
  }
  if (!command || !allowedCommands.has(command)) {
    throw new Error(`Command is not allowed: ${command || "empty"}.`);
  }
  const args = Array.isArray(value.args) ? value.args.map(String) : [];
  const env = value.env && typeof value.env === "object"
    ? Object.fromEntries(Object.entries(value.env as Record<string, unknown>).map(([key, item]) => [key, String(item)]))
    : {};
  return {
    serverId,
    name: typeof value.name === "string" ? value.name : serverId,
    type: "stdio",
    command,
    args,
    env,
    cwd: typeof value.cwd === "string" ? value.cwd : undefined,
  };
}
