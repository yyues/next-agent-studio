/**
 * DELETE /api/settings/skills/[roleId]/[skillId]
 *
 * 删除指定角色下的某个 skill 包（元数据 + Blob 文件）。
 * 通用角色(内置/已发布)仅管理员可删(见 assertRoleAccess)。
 */
import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { assertRoleAccess } from "@/lib/server-settings";
import { deleteSkill } from "@/lib/skills/upload";
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
    const message = e instanceof Error ? e.message : "Access denied.";
    const status = message.includes("admins") ? 403 : 404;
    return NextResponse.json({ error: message }, { status });
  }

  try {
    const { roleId, skillId } = await params;
    const result = await deleteSkill(roleId, skillId, "role");

    // 内容已变化,逐出该角色的 skills 进程内缓存(聊天注入立即读到删除后的版本)
    invalidateSkillsCache(roleId);

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete skill.";
    const status = message === "Skill not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
