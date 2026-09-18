/**
 * GET  /api/settings/skills/[roleId] — 查询某角色的 skills
 * POST /api/settings/skills/[roleId] — 上传 skill zip 包到指定角色
 *
 * skill 规范：zip 内含 SKILL.md（YAML frontmatter 元数据 + 指令正文），
 * 可选 prompts/、knowledge/ 子目录。frontmatter 字段：name(id)/title/description/version。
 * 上传核心见 lib/skills/upload.ts（与全局库上传共用）。
 *
 * 列表：合并 文件系统内置 skill（仓库提交，按 SKILL.md 扫描）+ 数据库上传 skill
 */
import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { assertRoleAccess } from "@/lib/server-settings";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import { connectToMongo } from "@/lib/mongodb";
import { SkillDocModel } from "@/lib/models/skill-doc";
import { parseFrontmatter } from "@/lib/skills";
import {
  uploadSkillZip,
  SkillUploadRejected,
} from "@/lib/skills/upload";
import { invalidateSkillsCache } from "@/lib/skills-cache";

const SKILLS_ROOT = resolve(process.cwd(), "skills");

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  try {
    const { roleId } = await params;

    // 1. 数据库中上传的 skills
    await connectToMongo();
    const dbSkills = (await SkillDocModel.find({ roleId }).lean()).map((d) => ({
      skillId: d.skillId,
      roleId,
      title: d.title,
      description: d.description ?? "",
      version: d.version ?? "1.0.0",
      filePath: d.filePath ?? `skills/${roleId}/${d.skillId}`,
      enabled: d.enabled,
      source: "blob" as const,
    }));

    // 2. 文件系统内置 skills（仓库提交，按 SKILL.md frontmatter 扫描）
    const fsSkills: Array<Record<string, unknown>> = [];
    const roleDir = join(SKILLS_ROOT, roleId);
    if (existsSync(roleDir)) {
      const skillDirs = readdirSync(roleDir).filter((name) =>
        statSync(join(roleDir, name)).isDirectory(),
      );
      for (const skillId of skillDirs) {
        const skillMdPath = join(roleDir, skillId, "SKILL.md");
        if (!existsSync(skillMdPath)) continue;
        try {
          const { meta } = parseFrontmatter(readFileSync(skillMdPath, "utf-8"));
          fsSkills.push({
            skillId: meta.name || meta.id || skillId,
            roleId,
            title: meta.title || meta.name || skillId,
            description: meta.description || "",
            version: meta.version || "1.0.0",
            filePath: `skills/${roleId}/${skillId}`,
            enabled: true,
            source: "builtin" as const,
          });
        } catch {
          // SKILL.md 解析失败跳过
        }
      }
    }

    // 合并，DB 覆盖同 skillId 的内置项（便于覆盖升级）
    const merged = new Map<string, Record<string, unknown>>();
    for (const s of fsSkills) merged.set(String(s.skillId), s);
    for (const s of dbSkills)
      merged.set(String(s.skillId), s as Record<string, unknown>);

    return NextResponse.json({ skills: Array.from(merged.values()) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list skills.";
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

    // 解析 multipart/form-data 获取 zip 文件
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

    const result = await uploadSkillZip(roleId, zipBuffer, { overwrite });

    // 内容已变化,逐出该角色的 skills 进程内缓存(聊天注入立即读到新版本)
    invalidateSkillsCache(roleId);

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
