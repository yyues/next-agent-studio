/**
 * 递归文本切片器
 *
 * 目标：把长文本切成 ~maxChunkSize 的片段，相邻片段保留 overlap 重叠，
 * 并尽量沿自然边界（段落 > 换行 > 句号 > 字符）拆分，避免切断句子。
 *
 * 零依赖实现，参数默认 ~800 字符/片、150 重叠（≈200 token/片）。
 * chunkPaginatedText 在此之上做 PDF 页感知切片（切片携带页码范围）。
 */

export type ChunkOptions = {
  /** 单片最大字符数，默认 800 */
  maxChunkSize?: number;
  /** 相邻切片重叠字符数，默认 150 */
  overlap?: number;
};

/** 页感知切片结果:content 之外携带覆盖的页码范围(PDF 溯源用) */
export type PaginatedChunk = {
  content: string;
  pageStart: number;
  pageEnd: number;
};

const DEFAULT_MAX = 800;
const DEFAULT_OVERLAP = 150;

/**
 * 递归分割器：依次尝试一组分隔符，片段超长则用下一级分隔符再切。
 * 返回的是平滑后的片段数组（已去除空串、已 trim）。
 */
function recursiveSplit(
  text: string,
  separators: string[],
  maxChunkSize: number,
): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (cleaned.length <= maxChunkSize) {
    return cleaned ? [cleaned] : [];
  }

  const sep = separators[0];
  const rest = separators.slice(1);

  // 用当前分隔符切分
  const pieces = cleaned.split(sep);

  const result: string[] = [];
  for (const piece of pieces) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    if (trimmed.length <= maxChunkSize) {
      result.push(trimmed);
    } else if (rest.length > 0) {
      // 仍超长 → 用下一级分隔符递归切
      result.push(...recursiveSplit(trimmed, rest, maxChunkSize));
    } else {
      // 已到最末级（字符）→ 硬切
      for (let i = 0; i < trimmed.length; i += maxChunkSize) {
        result.push(trimmed.slice(i, i + maxChunkSize));
      }
    }
  }
  return result;
}

/**
 * 把片段列表合并成目标大小的切片，相邻切片保留 overlap 重叠。
 */
function mergeWithOverlap(
  pieces: string[],
  maxChunkSize: number,
  overlap: number,
): string[] {
  if (pieces.length === 0) return [];

  const chunks: string[] = [];
  let current = pieces[0];

  for (let i = 1; i < pieces.length; i++) {
    const candidate = `${current}\n${pieces[i]}`;
    if (candidate.length <= maxChunkSize) {
      // 还能塞下，继续合并
      current = candidate;
    } else {
      // 塞不下 → 收尾当前 chunk，开启下一 chunk（带 overlap）
      chunks.push(current);
      const tail = current.slice(-overlap);
      current = `${tail}\n${pieces[i]}`.trim();
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

/**
 * 把任意长文本切成切片数组。
 */
export function chunkText(text: string, options?: ChunkOptions): string[] {
  const maxChunkSize = Math.max(64, options?.maxChunkSize ?? DEFAULT_MAX);
  const overlap = Math.min(
    maxChunkSize - 1,
    Math.max(0, options?.overlap ?? DEFAULT_OVERLAP),
  );

  if (!text || !text.trim()) return [];
  if (text.length <= maxChunkSize) return [text.trim()];

  // 分隔符优先级：段落 > 单换行 > 中文句号 > 英文句号 > 中文分号 > 空格
  // 中文断句符使纯中文文本不再落到字符级硬切
  const separators = ["\n\n", "\n", "。", ". ", "；", " "];
  const pieces = recursiveSplit(text, separators, maxChunkSize);
  return mergeWithOverlap(pieces, maxChunkSize, overlap);
}

/**
 * PDF 页感知切片:逐页文本累积进缓冲,缓冲超过 maxChunkSize 后对缓冲做
 * chunkText 切片并输出(记录覆盖的页码范围),小尾片留作下一轮种子与后续
 * 页合并——短页(目录/章尾)不产生碎片,跨页段落尽量保留在同一片内。
 */
export function chunkPaginatedText(
  pages: { page: number; text: string }[],
  options?: ChunkOptions,
): PaginatedChunk[] {
  const maxChunkSize = Math.max(64, options?.maxChunkSize ?? DEFAULT_MAX);
  const result: PaginatedChunk[] = [];

  let buffer = "";
  let startPage = 0;
  let endPage = 0;

  for (const { page, text } of pages) {
    const piece = text.trim();
    if (!piece) continue;
    if (!buffer) startPage = page;
    buffer = buffer ? `${buffer}\n\n${piece}` : piece;
    endPage = page;

    if (buffer.length < maxChunkSize) continue;

    const pieces = chunkText(buffer, options);
    const tail = pieces[pieces.length - 1] ?? "";
    for (const content of pieces.slice(0, -1)) {
      result.push({ content, pageStart: startPage, pageEnd: endPage });
    }
    if (tail && tail.length >= Math.floor(maxChunkSize * 0.75)) {
      // 尾片已接近单片大小:直接输出,清空缓冲
      result.push({ content: tail, pageStart: startPage, pageEnd: endPage });
      buffer = "";
    } else {
      // 小尾片作种子,页码范围随内容保留(内容确实来自该范围)
      buffer = tail;
    }
  }

  if (buffer.trim()) {
    for (const content of chunkText(buffer, options)) {
      result.push({ content, pageStart: startPage, pageEnd: endPage });
    }
  }
  return result;
}
