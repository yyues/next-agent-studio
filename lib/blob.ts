/**
 * Vercel Blob 封装。
 *
 * skill / resource 上传的文件内容统一存 Vercel Blob(开发与生产一致),
 * 元数据仍存 MongoDB,这里只负责对象存储的读写。
 *
 * 开发环境同样必须配置 BLOB_READ_WRITE_TOKEN(Vercel 项目 Storage →
 * 创建 Blob Store 后复制 token 填入),未配置时所有操作直接抛错。
 */
import { put, get, del, list } from "@vercel/blob";

function requireBlobToken(): void {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not configured. Create a Blob store on Vercel (Project → Storage) and set the token in .env.local.",
    );
  }
}

/**
 * 上传/覆盖一个 blob。pathname 稳定(不加随机后缀),便于按前缀删除与覆盖。
 */
export async function blobPut(
  pathname: string,
  body: string | Buffer | Blob,
  contentType?: string,
) {
  requireBlobToken();
  return put(pathname, body, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
  });
}

/**
 * 读取一个 blob 的文本内容。不存在返回 null。
 */
export async function blobGetText(pathname: string): Promise<string | null> {
  requireBlobToken();
  const res = await get(pathname, { access: "public" });
  if (!res || res.statusCode !== 200 || !res.stream) return null;
  // stream 是 web ReadableStream,用 Response 转文本
  return await new Response(res.stream).text();
}

/**
 * 读取一个 blob 的二进制内容(对象间拷贝用)。不存在返回 null。
 */
export async function blobGetBuffer(pathname: string): Promise<Buffer | null> {
  requireBlobToken();
  const res = await get(pathname, { access: "public" });
  if (!res || res.statusCode !== 200 || !res.stream) return null;
  return Buffer.from(await new Response(res.stream).arrayBuffer());
}

/**
 * 删除一个或多个 blob(按 pathname 或 url)。
 */
export async function blobDel(pathnames: string | string[]): Promise<void> {
  requireBlobToken();
  await del(Array.isArray(pathnames) ? pathnames : [pathnames]);
}

/**
 * 列出某前缀下的所有 blob,返回 pathname 列表(分页自动拉全)。
 */
export async function blobListPathnames(prefix: string): Promise<string[]> {
  requireBlobToken();
  const pathnames: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await list({ prefix, cursor, limit: 1000 });
    for (const b of res.blobs) pathnames.push(b.pathname);
    cursor = res.hasMore ? res.cursor : undefined;
  } while (cursor);
  return pathnames;
}
