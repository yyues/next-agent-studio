/**
 * DELETE /api/settings/roles/[roleId]/resources/[resourceId]
 *
 * 1. 从 MongoDB 删除元数据
 * 2. 删除 Vercel Blob 中该资源的所有文件（按 blobPrefix 前缀）
 */
import { NextResponse } from "next/server";
import { connectToMongo } from "@/lib/mongodb";
import { RoleResourceModel } from "@/lib/models/role-resource";
import { blobListPathnames, blobDel } from "@/lib/blob";
import { deleteResourceChunks } from "@/lib/rag";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ roleId: string; resourceId: string }> },
) {
  try {
    const { roleId, resourceId } = await params;

    await connectToMongo();
    const doc = await RoleResourceModel.findOneAndDelete({
      roleId,
      resourceId,
    }).lean();
    if (!doc) {
      return NextResponse.json({ error: "Resource not found." }, { status: 404 });
    }

    // 删除该资源下的所有 blob 文件
    const prefix = doc.blobPrefix ?? `resources/${roleId}/${resourceId}/`;
    try {
      const pathnames = await blobListPathnames(prefix);
      if (pathnames.length > 0) await blobDel(pathnames);
    } catch {
      // Blob 已不存在则忽略
    }

    // 清理该资源的 RAG 切片向量
    try {
      await deleteResourceChunks(roleId, resourceId);
    } catch {
      // 切片清理失败不阻断删除
    }

    return NextResponse.json({ deleted: true, roleId, resourceId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete resource.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
