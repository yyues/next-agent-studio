/**
 * RAG 编排层
 *
 * 三类入口：
 * 1. indexResourceFromBlob —— 上传资源后切片+向量化+入库
 *    （PDF 走逐页抽取+页感知切片，切片携带页码；.md/.txt 直接递归切片）
 * 2. deleteResourceChunks  —— 删资源/删角色时清理切片
 * 3. searchRoleKnowledge   —— 对话中 rag_search 工具执行时按 query 检索
 *
 * 索引/检索失败不阻断上传与对话，仅降级为无结果。
 */
import { connectToMongo } from "@/lib/mongodb";
import { ResourceChunkModel } from "@/lib/models/resource-chunk";
import { RoleResourceModel } from "@/lib/models/role-resource";
import { blobListPathnames, blobGetText, blobGetBuffer } from "@/lib/blob";
import { chunkText, chunkPaginatedText } from "@/lib/rag/chunking";
import { extractPdfPages } from "@/lib/rag/pdf";
import {
  buildEmbeddingModel,
  embedQuery,
  embedTexts,
} from "@/lib/rag/embeddings";
import { retrieveTopChunks, type RetrievedChunk } from "@/lib/rag/retrieve";
import { cachedLoad, invalidateCache } from "@/lib/config-cache";
import type { ProviderSettings } from "@/lib/server-settings";

/** 允许上传并索引的单文件扩展名（上传入口同此白名单） */
const INDEXABLE_EXT = new Set([".pdf", ".md", ".txt"]);

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
 * 返回切片数与警告（scanned_pdf 等透传给前端展示）。
 * 失败抛错（由调用方决定是否吞掉），但已存切片不会半残：先删后插。
 */
export async function indexResourceFromBlob(
  roleId: string,
  resourceId: string,
  blobPrefix: string,
  provider: ProviderSettings,
): Promise<{ chunks: number; warnings: string[] }> {
  await connectToMongo();

  const pathnames = (await blobListPathnames(blobPrefix)).filter(isIndexable);
  if (pathnames.length === 0) return { chunks: 0, warnings: [] };

  // 先删旧切片，保证幂等
  await deleteResourceChunks(roleId, resourceId);

  // 1. 逐文件切片。PDF 走逐页抽取 + 页感知切片（携带页码），
  //    其余文本文件整读后递归切片。扫描件跳过并记录警告。
  type PendingChunk = {
    fileName: string;
    content: string;
    pageStart?: number;
    pageEnd?: number;
  };
  const pending: PendingChunk[] = [];
  const warnings: string[] = [];

  for (const pathname of pathnames) {
    const relName = pathname.slice(blobPrefix.length);

    if (getExt(pathname) === ".pdf") {
      const buffer = await blobGetBuffer(pathname);
      if (!buffer) continue;
      const extracted = await extractPdfPages(buffer);
      warnings.push(...extracted.warnings);
      if (extracted.warnings.includes("scanned_pdf")) continue;
      for (const piece of chunkPaginatedText(extracted.pages)) {
        pending.push({ fileName: relName, ...piece });
      }
      continue;
    }

    const text = await blobGetText(pathname);
    if (!text) continue;
    for (const piece of chunkText(text)) {
      pending.push({ fileName: relName, content: piece });
    }
  }

  if (pending.length === 0) return { chunks: 0, warnings };

  // 2. 批量向量化
  const model = buildEmbeddingModel(provider);
  const embeddings = await embedTexts(
    pending.map((p) => p.content),
    model,
  );

  // 3. 入库（页码字段仅在存在时写入）
  const docs = pending.map((p, i) => ({
    roleId,
    resourceId,
    fileName: p.fileName,
    chunkIndex: i,
    content: p.content,
    ...(p.pageStart != null && p.pageEnd != null
      ? { pageStart: p.pageStart, pageEnd: p.pageEnd }
      : {}),
    embedding: embeddings[i],
    embeddingModel: provider.embeddingModel,
  }));
  await ResourceChunkModel.insertMany(docs, { ordered: false });
  invalidateCache("rag-chunks", roleId);

  return { chunks: docs.length, warnings };
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
  invalidateCache("rag-chunks", roleId);
}

/**
 * 统计角色已有切片数（判断是否挂载 rag_search 工具 / 是否需要检索）。
 * 进程内 TTL 缓存:切片增删(上传/删资源/删角色)主动逐出。
 */
export async function countRoleChunks(roleId: string): Promise<number> {
  return cachedLoad("rag-chunks", roleId, async () => {
    await connectToMongo();
    return ResourceChunkModel.countDocuments({ roleId });
  });
}

/**
 * rag_search 工具执行入口：query 向量化后检索 Top-K 切片。
 * query 为空或检索失败均返回空数组，不影响对话。
 * 权威资源("以此为准")的切片得分加权,同主题多版本时优先返回。
 */
export async function searchRoleKnowledge(
  roleId: string,
  query: string,
  provider: ProviderSettings,
  options?: { topK?: number; minScore?: number },
): Promise<RetrievedChunk[]> {
  const trimmed = query?.trim();
  if (!trimmed) return [];

  try {
    const model = buildEmbeddingModel(provider);
    // 向量化与权威资源解析互不依赖,并行执行
    const [queryVector, authorityId] = await Promise.all([
      embedQuery(trimmed, model),
      getAuthoritativeResourceId(roleId),
    ]);
    return await retrieveTopChunks(roleId, queryVector, {
      topK: options?.topK ?? 5,
      minScore: options?.minScore ?? 0.2,
      authoritativeResourceId: authorityId,
    });
  } catch {
    // 检索失败降级为无结果，不阻断工具调用
    return [];
  }
}

/**
 * 角色当前标记为"以此为准"的权威资源 id(每角色独占一个,无则 null)。
 * 进程内 TTL 缓存:PATCH 权威标记/删资源时主动逐出。
 */
export async function getAuthoritativeResourceId(
  roleId: string,
): Promise<string | null> {
  return cachedLoad("rag-auth", roleId, async () => {
    await connectToMongo();
    const doc = await RoleResourceModel.findOne({ roleId, authoritative: true })
      .select("resourceId")
      .lean();
    return doc?.resourceId ?? null;
  });
}

/**
 * 把检索结果拼成 rag_search 工具返回的文本（来源带页码溯源；
 * 权威资源的切片附 [权威资料] 标注，供模型在多版本冲突时优先采信）。
 */
export function formatSearchResults(hits: RetrievedChunk[]): string {
  if (hits.length === 0) return "未检索到相关内容。";
  const blocks = hits.map((h, i) => {
    const source = h.fileName
      ? `（来源：${h.fileName}${pageLabel(h)}）${h.authoritative ? "[权威资料]" : ""}`
      : "";
    return `[${i + 1}]${source}\n${h.content}`;
  });
  return [
    "以下为该角色知识库中检索到的相关参考资料（含来源与页码；带[权威资料]标注的来源为该角色指定的权威版本）：",
    blocks.join("\n\n"),
  ].join("\n\n");
}

function pageLabel(h: RetrievedChunk): string {
  if (h.pageStart == null) return "";
  return h.pageEnd != null && h.pageEnd !== h.pageStart
    ? ` 第${h.pageStart}-${h.pageEnd}页`
    : ` 第${h.pageStart}页`;
}
