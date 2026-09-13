import { Schema, model, models, type InferSchemaType } from "mongoose";

/**
 * 角色级外部 MCP server 配置(仅远程 URL:Streamable HTTP / SSE)。
 * 独立于 RoleProfile 集合,内置角色也允许挂载自定义 MCP。
 */
const mcpServerSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    roleId: { type: String, required: true },
    serverId: { type: String, required: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
    // 请求头(如 Authorization),以明文存储,与 ProviderConfig.apiKey 同级敏感度
    headers: { type: Map, of: String, default: {} },
    enabled: { type: Boolean, required: true, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

mcpServerSchema.index({ userId: 1, roleId: 1, serverId: 1 }, { unique: true });

export type McpServerDoc = InferSchemaType<typeof mcpServerSchema>;

export type McpServerConfig = {
  serverId: string;
  name: string;
  url: string;
  headers: Record<string, string>;
  enabled: boolean;
};

export function toMcpServerConfig(doc: Record<string, unknown>): McpServerConfig {
  const headers =
    doc.headers instanceof Map
      ? Object.fromEntries(doc.headers.entries())
      : typeof doc.headers === "object" && doc.headers !== null
        ? Object.fromEntries(
            Object.entries(doc.headers as Record<string, unknown>).filter(
              ([, v]) => typeof v === "string",
            ),
          )
        : {};

  return {
    serverId: String(doc.serverId),
    name: String(doc.name),
    url: String(doc.url),
    headers: headers as Record<string, string>,
    enabled: Boolean(doc.enabled),
  };
}

export const McpServerModel =
  models.McpServer ?? model("McpServer", mcpServerSchema);
