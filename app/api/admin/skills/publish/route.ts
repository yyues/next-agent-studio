/**
 * POST /api/admin/skills/publish — 将角色私有 skill 发布为全局 skill(仅管理员)。
 *
 * body: { roleId, skillId, overwrite? }
 * 目标全局 skill 已存在时返回 409(带 existing),前端确认后带 overwrite:true 重试。
 * 发布 = Blob 拷贝 + 元数据提升为 scope=global,原角色副本保留。
 */
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin";
import {
  publishSkillToGlobal,
  SkillUploadRejected,
} from "@/lib/skills/upload";
import { invalidateAllSkillsCache } from "@/lib/skills-cache";

export async function POST(req: Request) {
  if (!(await requireAdminUser(req))) {
    return NextResponse.json({ error: "Admin required." }, { status: 403 });
  }
  try {
    const { roleId, skillId, overwrite } = (await req.json()) as {
      roleId?: string;
      skillId?: string;
      overwrite?: boolean;
    };
    if (!roleId?.trim() || !skillId?.trim()) {
      return NextResponse.json(
        { error: "roleId and skillId are required." },
        { status: 400 },
      );
    }

    const result = await publishSkillToGlobal(roleId.trim(), skillId.trim(), {
      overwrite: overwrite === true,
    });

    // 全局库变更影响所有引用它的角色(含内置角色),清空全部缓存
    invalidateAllSkillsCache();

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SkillUploadRejected) {
      return NextResponse.json(
        { error: error.code, existing: error.existing },
        { status: 409 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Failed to publish skill.";
    const status = message === "Skill not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
