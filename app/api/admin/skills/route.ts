/**
 * 全局 skill 库维护(仅管理员,维护页 /admin 使用)。
 *
 * GET    /api/admin/skills — 全局库列表(元数据)
 * POST   /api/admin/skills — 上传 skill zip(?overwrite=true 覆盖升级)
 * DELETE /api/admin/skills?skillId=xxx — 删除
 *
 * 全局 skill 存 Blob 的 skills/general/ 前缀下(SkillDoc.roleId=general,
 * scope=global);内置角色自动注入,自定义角色经引用挂载使用。
 */
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin";
import { SkillDocModel } from "@/lib/models/skill-doc";
import {
  uploadSkillZip,
  deleteSkill,
  SkillUploadRejected,
} from "@/lib/skills/upload";
import { invalidateAllSkillsCache } from "@/lib/skills-cache";

const GLOBAL_SKILL_ROLE = "general";

function deny() {
  return NextResponse.json(
    { error: "Admin required." },
    { status: 403 },
  );
}

export async function GET(req: Request) {
  if (!(await requireAdminUser(req))) return deny();
  try {
    const docs = await SkillDocModel.find({
      roleId: GLOBAL_SKILL_ROLE,
      scope: "global",
    })
      .sort({ title: 1 })
      .lean();
    return NextResponse.json({
      skills: docs.map((d) => ({
        skillId: d.skillId,
        title: d.title,
        description: d.description ?? "",
        version: d.version ?? "1.0.0",
        md5: d.md5,
        filePath: d.filePath ?? "",
        enabled: d.enabled,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list global skills.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await requireAdminUser(req))) return deny();
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing 'file' field with a zip archive." },
        { status: 400 },
      );
    }

    const zipBuffer = Buffer.from(await file.arrayBuffer());
    const overwrite =
      new URL(req.url).searchParams.get("overwrite") === "true";

    const result = await uploadSkillZip(GLOBAL_SKILL_ROLE, zipBuffer, {
      overwrite,
      scope: "global",
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
      error instanceof Error ? error.message : "Failed to upload skill.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!(await requireAdminUser(req))) return deny();
  try {
    const skillId = new URL(req.url).searchParams.get("skillId");
    if (!skillId) {
      return NextResponse.json(
        { error: "skillId is required." },
        { status: 400 },
      );
    }
    const result = await deleteSkill(GLOBAL_SKILL_ROLE, skillId, "global");
    invalidateAllSkillsCache();
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete skill.";
    const status = message === "Skill not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
