/**
 * GET  /api/settings/roles/[roleId]/resources — 列出该角色所有 RAG 资料
 * POST /api/settings/roles/[roleId]/resources — 上传单个资料文件（.pdf/.md/.txt）
 *
 * 上传（Vercel Blob 方案，文件不落本地磁盘）：
 * 1. 校验扩展名与大小（≤20MB），不再接受 zip 压缩包
 * 2. 计算 MD5 去重
 * 3. put 到 resources/{roleId}/{resourceId}/{安全化文件名}
 * 4. 元数据（fileName/md5/blobPrefix/indexWarning）存 MongoDB
 */
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { connectToMongo } from "@/lib/mongodb";
import { RoleResourceModel } from "@/lib/models/role-resource";
import { blobPut, blobListPathnames, blobDel } from "@/lib/blob";
import { getProviderSettings } from "@/lib/server-settings";
import { indexResourceFromBlob } from "@/lib/rag";
import { getAuthUserId } from "@/lib/auth-request";
import { assertRoleAccess } from "@/lib/server-settings";

/** 允许上传的单文件扩展名（与 lib/rag 的 INDEXABLE_EXT 一致） */
const ALLOWED_EXTS = new Set([".pdf", ".md", ".txt"]);

/** 单文件大小上限 */
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".md": "text/markdown",
  ".txt": "text/plain",
};

function getExt(name: string): string {
  const lower = name.toLowerCase();
  const idx = lower.lastIndexOf(".");
  return idx === -1 ? "" : lower.slice(idx);
}

/** resourceId 用 ASCII 安全字符;纯非 ASCII 文件名(中文)退化为下划线时补 md5 片段避免撞名 */
function sanitizeName(name: string, md5: string): string {
  const base =
    name
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 64) || "resource";
  return /^[\d_]*$/.test(base.replace(/-/g, "")) && !/\d/.test(base)
    ? `${base}-${md5.slice(0, 8)}`
    : base;
}

/** blob 内文件名:仅去掉路径分隔符与控制符,尽量保留原名(来源展示可读) */
function safeEntryName(name: string): string {
  const cleaned = name.replace(/[\r\n\\/:*?"<>|#\s]+/g, "-").slice(-120);
  return cleaned || "file";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  try {
    const { roleId } = await params;
    await connectToMongo();
    const docs = await RoleResourceModel.find({ roleId }).lean();
    return NextResponse.json({
      resources: docs.map((d) => ({
        resourceId: d.resourceId,
        fileName: d.fileName,
        filePath: d.filePath,
        indexWarning: d.indexWarning ?? "",
        authoritative: d.authoritative ?? false,
        createdAt: d.createdAt,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list resources.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  // ownership 守卫:内置角色共享,自定义角色必须属于调用者
  try {
    const { roleId } = await params;
    const caller = await getAuthUserId(
      req,
      new URL(req.url).searchParams.get("userId"),
    );
    await assertRoleAccess(caller, roleId);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Access denied." },
      { status: 403 },
    );
  }

  try {
    const { roleId } = await params;
    const url = new URL(req.url);
    const userId = await getAuthUserId(
      req,
      url.searchParams.get("userId") ?? req.headers.get("x-user-id"),
    );

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing 'file' field." },
        { status: 400 },
      );
    }

    const ext = getExt(file.name);
    if (!ALLOWED_EXTS.has(ext)) {
      return NextResponse.json(
        {
          error: `UNSUPPORTED_FILE_TYPE: only ${[...ALLOWED_EXTS].join("/")} are supported (zip archives are no longer accepted)`,
        },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "FILE_TOO_LARGE: max 20MB per file." },
        { status: 413 },
      );
    }
    const buffer = Buffer.from(arrayBuffer);
    const md5 = createHash("md5").update(buffer).digest("hex");

    await connectToMongo();
    const existing = await RoleResourceModel.findOne({ roleId, md5 }).lean();
    if (existing) {
      return NextResponse.json(
        { error: "DUPLICATE_CONTENT", existing },
        { status: 409 },
      );
    }

    const resourceId = sanitizeName(file.name, md5);
    const blobPrefix = `resources/${roleId}/${resourceId}/`;

    // 同名资源(文件名相同、内容不同)默认拒绝,确认覆盖后才清理旧 blob 重传
    const overwrite = url.searchParams.get("overwrite") === "true";
    const existingById = await RoleResourceModel.findOne({
      roleId,
      resourceId,
    }).lean();
    if (existingById && !overwrite) {
      return NextResponse.json(
        {
          error: "RESOURCE_EXISTS",
          existing: { resourceId, fileName: existingById.fileName },
        },
        { status: 409 },
      );
    }

    // 清理旧 blob（保持覆盖上传的干净状态）
    try {
      const oldPathnames = await blobListPathnames(blobPrefix);
      if (oldPathnames.length > 0) await blobDel(oldPathnames);
    } catch {
      // 旧 blob 不存在则忽略
    }

    await blobPut(blobPrefix + safeEntryName(file.name), buffer, MIME_BY_EXT[ext]);

    await RoleResourceModel.findOneAndUpdate(
      { roleId, resourceId },
      {
        roleId,
        resourceId,
        fileName: file.name,
        md5,
        filePath: `resources/${roleId}/${resourceId}`,
        blobPrefix,
        indexWarning: "",
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );

    // 切片 + 向量化入库（RAG 索引）。失败不阻断上传，仅返回未索引标记。
    let indexed = false;
    let chunkCount = 0;
    let warnings: string[] = [];
    try {
      const providerSettings = await getProviderSettings(userId);
      const res = await indexResourceFromBlob(
        roleId,
        resourceId,
        blobPrefix,
        providerSettings.config,
      );
      indexed = true;
      chunkCount = res.chunks;
      warnings = res.warnings;
      if (warnings.length > 0) {
        await RoleResourceModel.updateOne(
          { roleId, resourceId },
          { $set: { indexWarning: warnings.join(",") } },
        );
      }
    } catch (err) {
      console.warn(
        `RAG indexing failed for ${roleId}/${resourceId}:`,
        err instanceof Error ? err.message : err,
      );
    }

    return NextResponse.json({
      roleId,
      resourceId,
      fileName: file.name,
      indexed,
      chunkCount,
      warnings,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upload resource.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
