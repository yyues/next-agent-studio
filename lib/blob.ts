/**
 * Vercel Blob 封装（含本地开发回退）
 *
 * 生产环境（Vercel）文件系统只读，skill / resource 文件内容存 Vercel Blob。
 * 元数据仍存 MongoDB，这里只负责对象存储的读写。
 *
 * 本地开发回退：未配置 BLOB_READ_WRITE_TOKEN 时，自动回退到本地磁盘
 * （写到 process.cwd() 下对应 pathname 的文件），开发环境无需 Blob store 即可上传/读取。
 * 配置了 token 则走 Vercel Blob，两者对调用方透明。
 *
 * 生产环境必须配置环境变量 BLOB_READ_WRITE_TOKEN（开 Blob 时获得）。
 */
import { put, get, del, list } from "@vercel/blob";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { join, resolve } from "path";

const hasBlobToken = !!process.env.BLOB_READ_WRITE_TOKEN;
// turbopackIgnore: 本地回退才用的运行时动态路径,静态分析无法追踪,显式排除避免整个项目被 trace 进产物
const LOCAL_ROOT = resolve(/*turbopackIgnore: true*/ process.cwd());

function localPath(pathname: string): string {
  return join(LOCAL_ROOT, pathname);
}

/**
 * 上传/覆盖一个 blob。pathname 稳定（不加随机后缀），便于按前缀删除与覆盖。
 * 无 token 时回退本地磁盘写入。
 */
export async function blobPut(
  pathname: string,
  body: string | Buffer | Blob,
  contentType?: string,
) {
  if (hasBlobToken) {
    return put(pathname, body, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
    });
  }
  // 本地回退
  const full = localPath(pathname);
  mkdirSync(resolve(full, ".."), { recursive: true });
  const data =
    typeof body === "string" || Buffer.isBuffer(body)
      ? body
      : Buffer.from(await (body as Blob).arrayBuffer());
  writeFileSync(full, data);
  return { pathname, url: `file://${full}` };
}

/**
 * 读取一个 blob 的文本内容。不存在返回 null。
 * 无 token 时回退本地磁盘读取。
 */
export async function blobGetText(pathname: string): Promise<string | null> {
  if (hasBlobToken) {
    const res = await get(pathname, { access: "public" });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    // stream 是 web ReadableStream，用 Response 转文本
    return await new Response(res.stream).text();
  }
  const full = localPath(pathname);
  if (!existsSync(full)) return null;
  return readFileSync(full, "utf-8");
}

/**
 * 删除一个或多个 blob（按 pathname 或 url）。
 * 无 token 时回退本地磁盘删除。
 */
export async function blobDel(pathnames: string | string[]): Promise<void> {
  const arr = Array.isArray(pathnames) ? pathnames : [pathnames];
  if (hasBlobToken) {
    await del(arr);
    return;
  }
  for (const p of arr) {
    const full = localPath(p);
    if (existsSync(full)) {
      try {
        rmSync(full, { force: true });
      } catch {
        // 删除失败忽略
      }
    }
  }
}

/**
 * 列出某前缀下的所有 blob，返回 pathname 列表（分页自动拉全）。
 * 无 token 时回退本地磁盘递归遍历。
 */
export async function blobListPathnames(prefix: string): Promise<string[]> {
  if (hasBlobToken) {
    const pathnames: string[] = [];
    let cursor: string | undefined;
    do {
      const res = await list({ prefix, cursor, limit: 1000 });
      for (const b of res.blobs) pathnames.push(b.pathname);
      cursor = res.hasMore ? res.cursor : undefined;
    } while (cursor);
    return pathnames;
  }
  // 本地回退：递归收集 prefix 目录下所有文件的相对 pathname
  const root = localPath(prefix);
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const s = statSync(full);
      if (s.isDirectory()) {
        walk(full);
      } else {
        // 转为相对 cwd 的 posix 路径，与 Blob pathname 格式一致
        const rel = full
          .slice(LOCAL_ROOT.length)
          .replace(/^[\\/]+/, "")
          .replace(/\\/g, "/");
        out.push(rel);
      }
    }
  };
  walk(root);
  return out;
}
