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

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ roleId: string; skillId: string }> },
) {
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

    return NextResponse.json({ deleted: true, skillId, roleId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete skill.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
