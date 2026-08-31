/**
 * RAG 编排层
 *
 * 三类入口：
 * 1. indexResourceFromBlob —— 上传资源后切片+向量化+入库
 * 2. deleteResourceChunks  —— 删资源/删角色时清理切片
 * 3. getRagContext         —— 对话时按 query 检索并拼成上下文文本
 *
 * 所有路径都包裹 try/catch：索引/检索失败不阻断上传与对话，仅降级为无上下文。
 */
import { connectToMongo } from "@/lib/mongodb";
import { ResourceChunkModel } from "@/lib/models/resource-chunk";
import { blobListPathnames, blobGetText } from "@/lib/blob";
import { chunkText } from "@/lib/rag/chunking";
import {
  buildEmbeddingModel,
  embedQuery,
  embedTexts,
} from "@/lib/rag/embeddings";
import { retrieveTopChunks, type RetrievedChunk } from "@/lib/rag/retrieve";
import type { ProviderSettings } from "@/lib/server-settings";

/**
 * 可索引的文本文件扩展名。其余（图片/pdf 二进制等）跳过。
 * pdf 文本抽取需额外依赖，暂不支持，后续可扩展。
 */
const INDEXABLE_EXT = new Set([
  ".md",
  ".txt",
  ".markdown",
  ".json",
  ".csv",
  ".html",
  ".htm",
  ".xml",
  ".yaml",
  ".yml",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".sh",
  ".sql",
  ".log",
]);

function getExt(pathname: string): string {
  const lower = pathname.toLowerCase();
  const idx = lower.lastIndexOf(".");
  return idx === -1 ? "" : lower.slice(idx);
}

function isIndexable(pathname: string): boolean {
  return INDEXABLE_EXT.has(getExt(pathname));
}

/**
 * 上传资源后调用：从 Blob 读取资源文件 → 切片 → 批量向量化 → 入库。
 * 同一 resourceId 先清旧切片，保证重复上传幂等。
 *
 * 失败抛错（由调用方决定是否吞掉），但已存切片不会半残：先删后插。
 */
export async function indexResourceFromBlob(
  roleId: string,
  resourceId: string,
  blobPrefix: string,
  provider: ProviderSettings,
): Promise<{ chunks: number }> {
  await connectToMongo();

  const pathnames = (await blobListPathnames(blobPrefix)).filter(isIndexable);
  if (pathnames.length === 0) return { chunks: 0 };

  // 先删旧切片，保证幂等
  await deleteResourceChunks(roleId, resourceId);

  // 1. 读取所有文件文本，记录来源文件名
  type PendingChunk = { fileName: string; content: string };
  const pending: PendingChunk[] = [];
  for (const pathname of pathnames) {
    const text = await blobGetText(pathname);
    if (!text) continue;
    const relName = pathname.slice(blobPrefix.length);
    for (const piece of chunkText(text)) {
      pending.push({ fileName: relName, content: piece });
    }
  }
  if (pending.length === 0) return { chunks: 0 };

  // 2. 批量向量化
  const model = buildEmbeddingModel(provider);
  const embeddings = await embedTexts(
    pending.map((p) => p.content),
    model,
  );

  // 3. 入库
  const docs = pending.map((p, i) => ({
    roleId,
    resourceId,
    fileName: p.fileName,
    chunkIndex: i,
    content: p.content,
    embedding: embeddings[i],
    embeddingModel: provider.embeddingModel,
  }));
  await ResourceChunkModel.insertMany(docs, { ordered: false });

  return { chunks: docs.length };
}

/**
 * 删除切片：指定 resourceId 时删该资源切片，否则删角色全部切片。
 */
export async function deleteResourceChunks(
  roleId: string,
  resourceId?: string,
): Promise<void> {
  await connectToMongo();
  const filter = resourceId ? { roleId, resourceId } : { roleId };
  await ResourceChunkModel.deleteMany(filter);
}

/**
 * 统计角色已有切片数（用于对话时判断是否需要检索）。
 */
export async function countRoleChunks(roleId: string): Promise<number> {
  await connectToMongo();
  return ResourceChunkModel.countDocuments({ roleId });
}

/**
 * 对话时检索：用 query 向量检索 Top-K 切片，拼成上下文文本。
 * 角色无切片或检索失败均返回空串，不影响对话。
 */
export async function getRagContext(
  roleId: string,
  query: string,
  provider: ProviderSettings,
  options?: { topK?: number; minScore?: number },
): Promise<string> {
  const trimmed = query?.trim();
  if (!trimmed) return "";

  // 角色无资源切片 → 跳过，省 embedding 费用
  const total = await countRoleChunks(roleId);
  if (total === 0) return "";

  try {
    const model = buildEmbeddingModel(provider);
    const queryVector = await embedQuery(trimmed, model);
    const hits = await retrieveTopChunks(roleId, queryVector, {
      topK: options?.topK ?? 5,
      minScore: options?.minScore ?? 0.2,
    });
    if (hits.length === 0) return "";
    return formatRagContext(hits);
  } catch {
    // 检索失败降级为无上下文，不阻断对话
    return "";
  }
}

/**
 * 把检索结果拼成注入 system prompt 的上下文段。
 */
export function formatRagContext(hits: RetrievedChunk[]): string {
  const blocks = hits.map((h, i) => {
    const source = h.fileName ? `（来源：${h.fileName}）` : "";
    return `[${i + 1}]${source}\n${h.content}`;
  });
  return [
    "以下是从该角色知识库中检索到的相关参考资料，请优先据此回答用户问题；若资料未涵盖，再依据自身能力作答：",
    blocks.join("\n\n"),
  ].join("\n\n");
}
