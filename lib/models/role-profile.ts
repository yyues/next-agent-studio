import { Schema, model, models, type InferSchemaType } from "mongoose";

const roleProfileSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    roleId: { type: String, required: true },
    displayName: { type: String, required: true },
    description: { type: String, default: "" },
    enabled: { type: Boolean, required: true, default: true },
    systemPrompt: { type: String, required: true },
    /**
     * 引用的外部 skill 键(`${srcRoleId}/${skillId}`),来源限全局库与
     * 自己的其他角色;自己上传的 skill 不进此列表(上传即启用)。
     */
    skillIds: { type: [String], required: true, default: [] },
    /** 引用的外部 MCP 键(`${srcRoleId}/${serverId}`,`__global__` 表示全局库) */
    mcpRefs: { type: [String], default: [] },
    /** 引用 MCP 的角色级挂载覆盖；未设置时继承来源 MCP 的 mounted */
    mcpMountOverrides: { type: Map, of: Boolean, default: {} },
    toolToggles: { type: Map, of: Boolean, default: {} },
    priority: { type: Number, required: true, default: 0 },
    /** 新会话开场建议问题 */
    suggestions: { type: [String], default: [] },
    /** private=仅自己可见;public=管理员发布,所有用户可见(只读) */
    visibility: {
      type: String,
      enum: ["private", "public"],
      default: "private",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

roleProfileSchema.index({ userId: 1, roleId: 1 }, { unique: true });

export type RoleProfileDoc = InferSchemaType<typeof roleProfileSchema>;

export const RoleProfileModel = models.RoleProfile ?? model("RoleProfile", roleProfileSchema);
