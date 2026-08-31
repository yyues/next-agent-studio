/**
 * ResourceChunk — RAG 切片向量化存储模型
 *
 * 资源文件切片后的文本与 embedding 向量，用于语义检索。
 * 切片内容来自 Vercel Blob 中的资源文件（resources/{roleId}/{resourceId}/...），
 * 上传资源时切片 + embed 后入库；检索时按 roleId 拉取全部切片做余弦相似度排序。
 *
 * 向量维度随 embedding 模型变化（text-embedding-3-small = 1536），
 * 这里不固定维度，按模型实际输出存储。
 */
import { Schema, model, models, type InferSchemaType } from "mongoose";

const resourceChunkSchema = new Schema(
  {
    // 所属角色 ID，关联 RoleProfile.roleId，检索按此过滤
    roleId: { type: String, required: true, index: true },
    // 所属资源 ID，关联 RoleResource.resourceId
    resourceId: { type: String, required: true },
    // 来源文件名（zip 内相对路径），便于引用来源
    fileName: { type: String, required: true },
    // 切片序号，同一文件内递增
    chunkIndex: { type: Number, required: true },
    // 切片文本内容
    content: { type: String, required: true },
    // embedding 向量（维度由模型决定）
    embedding: { type: [Number], required: true },
    // 生成向量所用模型，便于模型切换后重建索引
    embeddingModel: { type: String, default: "" },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// 检索主索引：按角色拉取全部切片
resourceChunkSchema.index({ roleId: 1 });
// 按资源删除切片
resourceChunkSchema.index({ roleId: 1, resourceId: 1 });
// 同一文件内切片序号唯一
resourceChunkSchema.index({ roleId: 1, resourceId: 1, chunkIndex: 1 }, { unique: true });

export type ResourceChunkDoc = InferSchemaType<typeof resourceChunkSchema>;

export const ResourceChunkModel =
  models.ResourceChunk ?? model("ResourceChunk", resourceChunkSchema);
