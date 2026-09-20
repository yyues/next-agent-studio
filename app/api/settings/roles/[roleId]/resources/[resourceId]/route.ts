/**
 * DELETE /api/settings/roles/[roleId]/resources/[resourceId]
 *
 * 1. 从 MongoDB 删除元数据
 * 2. 删除 Vercel Blob 中该资源的所有文件（按 blobPrefix 前缀）
 *
 * PATCH /api/settings/roles/[roleId]/resources/[resourceId]
 * body: { authoritative: boolean } — 设置/取消"以此为准"权威标记(每角色独占)
 */
import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { assertRoleAccess } from "@/lib/server-settings";
import { connectToMongo } from "@/lib/mongodb";
import { RoleResourceModel } from "@/lib/models/role-resource";
import { blobListPathnames, blobDel } from "@/lib/blob";
import { deleteResourceChunks } from "@/lib/rag";
import { invalidateCache } from "@/lib/config-cache";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ roleId: string; resourceId: string }> },
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
    // 被删资源可能是权威标记源,逐出权威缓存
    invalidateCache("rag-auth", roleId);

    return NextResponse.json({ deleted: true, roleId, resourceId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete resource.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ roleId: string; resourceId: string }> },
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
    const { roleId, resourceId } = await params;
    const body = (await req.json()) as { authoritative?: boolean };
    if (typeof body.authoritative !== "boolean") {
      return NextResponse.json(
        { error: "authoritative (boolean) is required." },
        { status: 400 },
      );
    }

    await connectToMongo();
    if (body.authoritative) {
      // 权威标记每角色独占:先清同角色其他标记,再设置目标
      await RoleResourceModel.updateMany(
        { roleId, authoritative: true },
        { $set: { authoritative: false } },
      );
    }
    const doc = await RoleResourceModel.findOneAndUpdate(
      { roleId, resourceId },
      { $set: { authoritative: body.authoritative } },
      { new: true },
    ).lean();
    if (!doc) {
      return NextResponse.json(
        { error: "Resource not found." },
        { status: 404 },
      );
    }

    invalidateCache("rag-auth", roleId);
    return NextResponse.json({
      roleId,
      resourceId,
      authoritative: doc.authoritative,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update resource.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
