/**
 * SkillDoc — MongoDB 模型
 *
 * 记录每个 skill 包的元数据，用于：
 * 1. 防重复上传（MD5 校验）
 * 2. 快速查询角色关联的 skills（按 roleId 索引）
 * 3. 审计追踪（createdAt / updatedAt）
 *
 * 实际文件存储在 skills/{roleId}/{skillId}/ 目录下，
 * 此模型只存元数据和指向文件的路径。
 */
import { Schema, model, models, type InferSchemaType } from "mongoose";

const skillDocSchema = new Schema(
  {
    // skill 唯一标识，来自 manifest.json 的 id 字段
    skillId: { type: String, required: true },
    // 所属角色 ID，关联 RoleProfile.roleId
    roleId: { type: String, required: true, index: true },
    // skill 版本号，来自 manifest.json 的 version 字段
    version: { type: String, default: "1.0.0" },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    // zip 包内容的 MD5，用于去重校验
    md5: { type: String, required: true },
    // 解压后的目录路径，如 "skills/pm/product-manager/"
    filePath: { type: String, required: true },
    enabled: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// 同一角色下 skillId 唯一
skillDocSchema.index({ roleId: 1, skillId: 1 }, { unique: true });
// 同一角色下 MD5 唯一（防重复上传）
skillDocSchema.index({ roleId: 1, md5: 1 });

export type SkillDoc = InferSchemaType<typeof skillDocSchema>;

export const SkillDocModel =
  models.SkillDoc ?? model("SkillDoc", skillDocSchema);
