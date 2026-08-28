/**
 * DELETE /api/settings/skills/[roleId]/[skillId]
 *
 * 删除指定角色下的某个 skill 包：
 * 1. 从 MongoDB 删除元数据记录
 * 2. 删除 skills/{roleId}/{skillId}/ 目录及内容
 * 3. 检查是否有其他角色引用该 skill（仅提示，不阻断）
 */
import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { connectToMongo } from "@/lib/mongodb";
import { SkillDocModel } from "@/lib/models/skill-doc";

const SKILLS_ROOT = resolve(process.cwd(), "skills");

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ roleId: string; skillId: string }> },
) {
  try {
    const { roleId, skillId } = await params;

    // 1. 删除数据库记录
    await connectToMongo();
    const result = await SkillDocModel.deleteOne({ roleId, skillId });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Skill not found." }, { status: 404 });
    }

    // 2. 删除文件目录
    const targetDir = join(SKILLS_ROOT, roleId, skillId);
    if (existsSync(targetDir)) {
      const { rmSync } = require("fs");
      rmSync(targetDir, { recursive: true, force: true });
    }

    return NextResponse.json({ deleted: true, skillId, roleId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete skill.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
