/**
 * GET /api/settings/skills
 *
 * 查询所有角色下的 skills 汇总列表。
 * 支持 ?roleId=xxx 过滤指定角色。
 */
import { NextResponse } from "next/server";
import { readdirSync, existsSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import { connectToMongo } from "@/lib/mongodb";
import { SkillDocModel } from "@/lib/models/skill-doc";
import { parseFrontmatter } from "@/lib/skills";

const SKILLS_ROOT = resolve(process.cwd(), "skills");

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const roleIdFilter = url.searchParams.get("roleId");

    // 优先从数据库查询（支持 MD5、enabled 等元数据）
    await connectToMongo();
    const query: Record<string, unknown> = {};
    if (roleIdFilter) query.roleId = roleIdFilter;
    const docs = await SkillDocModel.find(query).lean();

    // 如果数据库为空，回退到文件系统扫描（按 SKILL.md frontmatter）
    if (docs.length === 0 && existsSync(SKILLS_ROOT)) {
      const roles = roleIdFilter
        ? [roleIdFilter]
        : readdirSync(SKILLS_ROOT).filter((name) =>
            statSync(join(SKILLS_ROOT, name)).isDirectory(),
          );

      const skills: Record<string, unknown>[] = [];
      for (const roleId of roles) {
        const roleDir = join(SKILLS_ROOT, roleId);
        if (!existsSync(roleDir)) continue;
        const skillDirs = readdirSync(roleDir).filter((name) =>
          statSync(join(roleDir, name)).isDirectory(),
        );
        for (const skillId of skillDirs) {
          const skillMdPath = join(roleDir, skillId, "SKILL.md");
          if (!existsSync(skillMdPath)) continue;
          try {
            const { meta } = parseFrontmatter(
              readFileSync(skillMdPath, "utf-8"),
            );
            skills.push({
              skillId: meta.name || meta.id || skillId,
              roleId,
              title: meta.title || meta.name || skillId,
              description: meta.description || "",
              version: meta.version || "1.0.0",
              filePath: `skills/${roleId}/${skillId}`,
              enabled: true,
              source: "file",
            });
          } catch {
            continue;
          }
        }
      }
      return NextResponse.json({ skills });
    }

    return NextResponse.json({ skills: docs });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list skills.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
