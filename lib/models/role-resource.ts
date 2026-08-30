import { Schema, model, models, type InferSchemaType } from "mongoose";

const roleResourceSchema = new Schema(
  {
    resourceId: { type: String, required: true },
    roleId: { type: String, required: true, index: true },
    fileName: { type: String, required: true },
    md5: { type: String, required: true },
    // 逻辑展示路径
    filePath: { type: String, default: "" },
    // Vercel Blob 目录前缀，如 "resources/{roleId}/{resourceId}/"
    blobPrefix: { type: String, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

roleResourceSchema.index({ roleId: 1, resourceId: 1 }, { unique: true });
roleResourceSchema.index({ roleId: 1, md5: 1 });

export type RoleResourceDoc = InferSchemaType<typeof roleResourceSchema>;

export const RoleResourceModel =
  models.RoleResource ?? model("RoleResource", roleResourceSchema);
