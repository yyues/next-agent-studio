/**
 * 语义检索
 *
 * 检索策略：按 roleId 从 MongoDB 拉全部切片（含向量），
 * 用 query 向量与每条切片向量做余弦相似度，排序后取 Top-K。
 *
 * 角色级知识库通常为百级切片，内存余弦排序 <50ms，无需 Mongo 向量索引。
 * 切片量到万级时，可平滑切到 Atlas $vectorSearch（存储模型不变）。
 */
import { connectToMongo } from "@/lib/mongodb";
import { ResourceChunkModel } from "@/lib/models/resource-chunk";

export type RetrievedChunk = {
  content: string;
  fileName: string;
  resourceId: string;
  score: number;
};

/**
 * 余弦相似度。向量长度一致时 O(n)。
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * 取相似度 Top-K 切片。低于 minScore 的会被过滤。
 */
export async function retrieveTopChunks(
  roleId: string,
  queryVector: number[],
  options?: { topK?: number; minScore?: number },
): Promise<RetrievedChunk[]> {
  const topK = options?.topK ?? 5;
  const minScore = options?.minScore ?? 0.2;

  await connectToMongo();
  const chunks = await ResourceChunkModel.find({ roleId })
    .select("content fileName resourceId embedding -_id")
    .lean();

  if (chunks.length === 0) return [];

  const scored = chunks
    .map((c) => ({
      content: c.content,
      fileName: c.fileName,
      resourceId: c.resourceId,
      score: cosineSimilarity(queryVector, c.embedding ?? []),
    }))
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}
