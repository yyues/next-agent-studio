/**
 * DELETE /api/settings/skills/[roleId]/[skillId]
 *
 * 删除指定角色下的某个 skill 包：
 * 1. 从 MongoDB 删除元数据记录
 * 2. 删除 Vercel Blob 中该 skill 前缀下的所有解压文件
 */
import { NextResponse } from "next/server";
import { connectToMongo } from "@/lib/mongodb";
import { SkillDocModel } from "@/lib/models/skill-doc";
import { blobDel, blobListPathnames } from "@/lib/blob";
import { getAuthUserId } from "@/lib/auth-request";
import { assertRoleAccess } from "@/lib/server-settings";
import { invalidateSkillsCache } from "@/lib/skills-cache";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ roleId: string; skillId: string }> },
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
    const { roleId, skillId } = await params;

    // 1. 删除数据库记录
    await connectToMongo();
    const doc = await SkillDocModel.findOneAndDelete({ roleId, skillId }).lean();
    if (!doc) {
      return NextResponse.json({ error: "Skill not found." }, { status: 404 });
    }

    // 2. 删除 Blob 内容（blobPath 为前缀，列出其下所有文件后批量删除）
    if (doc.blobPath) {
      try {
        const pathnames = await blobListPathnames(doc.blobPath);
        if (pathnames.length > 0) await blobDel(pathnames);
      } catch {
        // Blob 已不存在则忽略
      }
    }

    // 内容已变化,逐出该角色的 skills 进程内缓存(聊天注入立即读到删除后的版本)
    invalidateSkillsCache(roleId);

    return NextResponse.json({ deleted: true, skillId, roleId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete skill.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
