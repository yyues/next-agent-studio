/**
 * PDF 文本逐页抽取
 *
 * 基于 unpdf(pdf.js 服务端封装),索引时按页抽取文本并做基础清洗,
 * 供 chunkPaginatedText 做页感知切片(切片可溯源到页码)。
 *
 * 图片型(扫描件)PDF 没有文本层,抽取结果近乎为空——检测后返回
 * scanned_pdf 警告,由调用方跳过索引并把警告透传给前端。
 */
import { extractText, getDocumentProxy } from "unpdf";

export type PdfPage = { page: number; text: string };

/** 扫描件判定阈值:平均每页有效字符低于该值视为无可抽取文本 */
const MIN_CHARS_PER_PAGE = 20;

/** 单个 PDF 最多索引的页数,超出截断 */
const MAX_PAGES = 500;

/**
 * 页内文本清洗:
 * - 行尾连字符断词修复(conse-\nquence → consequence)
 * - 压缩行内空白与连续空行
 */
function cleanPageText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/([A-Za-z])-\n([a-z])/g, "$1$2")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 逐页抽取 PDF 文本,返回 1 起始页码的页文本与警告列表:
 * - scanned_pdf:疑似扫描件,无文本层,pages 为空
 * - too_many_pages:超过 MAX_PAGES,超出部分截断
 *
 * 抽取失败(加密/损坏的 PDF)直接抛错,由调用方决定降级方式。
 */
export async function extractPdfPages(buffer: Buffer): Promise<{
  pages: PdfPage[];
  warnings: string[];
}> {
  const warnings: string[] = [];

  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  const rawPages = Array.isArray(text) ? text : [text];

  if (rawPages.length > MAX_PAGES) {
    warnings.push("too_many_pages");
  }
  const pageCount = Math.min(rawPages.length, MAX_PAGES);

  const pages: PdfPage[] = [];
  let totalChars = 0;
  for (let i = 0; i < pageCount; i++) {
    const cleaned = cleanPageText(rawPages[i] ?? "");
    totalChars += cleaned.length;
    if (cleaned) pages.push({ page: i + 1, text: cleaned });
  }

  // 分母用总页数:空白页同样说明缺文本层,只有零星几页有字也算扫描件
  if (rawPages.length === 0 || totalChars / rawPages.length < MIN_CHARS_PER_PAGE) {
    return { pages: [], warnings: [...warnings, "scanned_pdf"] };
  }

  return { pages, warnings };
}
