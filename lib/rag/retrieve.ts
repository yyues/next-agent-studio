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
  /** PDF 切片的页码范围(文本类切片无) */
  pageStart?: number;
  pageEnd?: number;
  /** 来自角色标记为"以此为准"的权威资源 */
  authoritative?: boolean;
};

/** 权威资源切片的相似度加成:只翻转接近的得分,不把无关切片顶上来 */
const AUTHORITY_SCORE_BOOST = 0.05;

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
 * authoritativeResourceId 对应资源的切片得分加成(同主题多版本时权威优先,
 * 加成幅度小,不影响跨主题的自然排序)。
 */
export async function retrieveTopChunks(
  roleId: string,
  queryVector: number[],
  options?: {
    topK?: number;
    minScore?: number;
    authoritativeResourceId?: string | null;
  },
): Promise<RetrievedChunk[]> {
  const topK = options?.topK ?? 5;
  const minScore = options?.minScore ?? 0.2;
  const authorityId = options?.authoritativeResourceId ?? null;

  await connectToMongo();
  const chunks = await ResourceChunkModel.find({ roleId })
    .select("content fileName resourceId pageStart pageEnd embedding -_id")
    .lean();

  if (chunks.length === 0) return [];

  const scored = chunks
    .map((c) => {
      const authoritative = authorityId !== null && c.resourceId === authorityId;
      const score =
        cosineSimilarity(queryVector, c.embedding ?? []) +
        (authoritative ? AUTHORITY_SCORE_BOOST : 0);
      return {
        content: c.content,
        fileName: c.fileName,
        resourceId: c.resourceId,
        pageStart: c.pageStart ?? undefined,
        pageEnd: c.pageEnd ?? undefined,
        authoritative: authoritative || undefined,
        score,
      };
    })
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}
