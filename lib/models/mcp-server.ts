import { Schema, model, models, type InferSchemaType } from "mongoose";
import { decryptSecretMap } from "@/lib/secret-crypto";

/**
 * 角色级外部 MCP server 配置。
 * - http:远程 URL(Streamable HTTP / SSE),字段 url + headers
 * - stdio:本地命令(command/args/env),服务端 spawn 子进程
 * 独立于 RoleProfile 集合,内置角色也允许挂载自定义 MCP。
 */
const mcpServerSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    roleId: { type: String, required: true },
    serverId: { type: String, required: true },
    name: { type: String, required: true },
    /** http=远程 URL;stdio=本地命令 */
    type: {
      type: String,
      enum: ["http", "stdio"],
      default: "http",
    },
    /** http 型必填;stdio 型留空 */
    url: { type: String, default: "" },
    // 请求头(如 Authorization);值以 enc:v1: 密文存储,读出经 toMcpServerConfig 解密
    headers: { type: Map, of: String, default: {} },
    /** stdio 型命令(如 npx / node / uvx) */
    command: { type: String, default: "" },
    /** stdio 型命令参数(argv 数组直传,不经 shell) */
    args: { type: [String], default: [] },
    // stdio 型环境变量;值同样以 enc:v1: 密文存储
    env: { type: Map, of: String, default: {} },
    enabled: { type: Boolean, required: true, default: true },
    /** 是否随角色自动挂载；关闭后仍可通过 @名称 单次调用 */
    mounted: { type: Boolean, required: true, default: true },
    /** role=角色私有;global=全局库(userId=__system__/roleId=__global__,管理员维护) */
    scope: {
      type: String,
      enum: ["role", "global"],
      default: "role",
    },
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
  type: "http" | "stdio";
  /** http 型的远程地址;stdio 型为空串 */
  url: string;
  headers: Record<string, string>;
  /** stdio 型命令;http 型为空串 */
  command: string;
  args: string[];
  /** stdio 型环境变量(值已解密);http 型为空对象 */
  env: Record<string, string>;
  enabled: boolean;
  /** 自动挂载到聊天；旧数据缺失该字段时按 true 兼容 */
  mounted: boolean;
};

/** Map/对象 → 字符串记录(过滤非字符串值) */
function toStringMap(value: unknown): Record<string, string> {
  if (value instanceof Map) {
    return Object.fromEntries(
      [...value.entries()].filter(([, v]) => typeof v === "string") as [string, string][],
    );
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(([, v]) => typeof v === "string"),
    ) as Record<string, string>;
  }
  return {};
}

export function toMcpServerConfig(doc: Record<string, unknown>): McpServerConfig {
  const command = typeof doc.command === "string" ? doc.command : "";
  const type = doc.type === "stdio" || (!doc.type && command && !doc.url) ? "stdio" : "http";

  return {
    serverId: String(doc.serverId),
    name: String(doc.name),
    type,
    url: typeof doc.url === "string" ? doc.url : "",
    headers: decryptSecretMap(toStringMap(doc.headers)),
    command,
    args: Array.isArray(doc.args) ? doc.args.map(String) : [],
    env: decryptSecretMap(toStringMap(doc.env)),
    enabled: Boolean(doc.enabled),
    mounted: doc.mounted === undefined ? true : Boolean(doc.mounted),
  };
}

export const McpServerModel = models.McpServer ?? model("McpServer", mcpServerSchema);
