/**
 * GET  /api/settings/skills/[roleId] — 查询某角色的 skills
 * POST /api/settings/skills/[roleId] — 上传 skill zip 包到指定角色
 *
 * skill 规范：zip 内含 SKILL.md（YAML frontmatter 元数据 + 指令正文），
 * 可选 prompts/、knowledge/ 子目录。frontmatter 字段：name(id)/title/description/version。
 *
 * 上传流程（按 zip 原结构逐文件解压到 Vercel Blob，不生成合并 JSON）：
 * 1. 接收 multipart/form-data 中的 zip 文件，内存解压
 * 2. 找到 SKILL.md，解析 frontmatter 取元数据（name/title/description/version）
 * 3. 计算 zip MD5，查数据库去重
 * 4. 把 zip 内每个文件按原相对路径存到 skills/{roleId}/{skillId}/ 前缀下
 * 5. 写入 MongoDB 元数据记录（blobPath = 前缀）
 *
 * 列表：合并 文件系统内置 skill（仓库提交，按 SKILL.md 扫描）+ 数据库上传 skill
 */
import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { assertRoleAccess } from "@/lib/server-settings";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import { createHash } from "crypto";
import AdmZip from "adm-zip";
import { connectToMongo } from "@/lib/mongodb";
import { SkillDocModel } from "@/lib/models/skill-doc";
import { blobPut } from "@/lib/blob";
import { parseFrontmatter } from "@/lib/skills";

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

    // 读取 zip 文件为 Buffer
    const arrayBuffer = await file.arrayBuffer();
    const zipBuffer = Buffer.from(arrayBuffer);

    // 计算 MD5 用于去重校验
    const md5 = createHash("md5").update(zipBuffer).digest("hex");

    // 内存解压
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    // 查找 SKILL.md（可能在根目录或一级子目录下）
    let skillMdEntry = entries.find((e) => e.entryName === "SKILL.md");
    if (!skillMdEntry) {
      skillMdEntry = entries.find((e) => e.entryName.endsWith("/SKILL.md"));
    }
    if (!skillMdEntry) {
      return NextResponse.json(
        { error: "Zip archive must contain a SKILL.md file." },
        { status: 400 },
      );
    }

    const { meta } = parseFrontmatter(
      skillMdEntry.getData().toString("utf-8"),
    );
    const skillId = meta.name || meta.id;
    if (!skillId) {
      return NextResponse.json(
        { error: "SKILL.md frontmatter must contain a 'name' field." },
        { status: 400 },
      );
    }
    const title = meta.title || skillId;

    // 计算 zip 根目录前缀（如 "product-manager/"），后续读文件时去掉
    const rootPrefix = skillMdEntry.entryName.includes("/")
      ? skillMdEntry.entryName.split("/")[0] + "/"
      : null;

    // 数据库去重校验
    await connectToMongo();
    const existingByMd5 = await SkillDocModel.findOne({ roleId, md5 }).lean();
    if (existingByMd5) {
      return NextResponse.json(
        {
          error: "A skill with identical content already exists.",
          existing: existingByMd5,
        },
        { status: 409 },
      );
    }

    // 按 zip 原结构逐文件解压到 Vercel Blob 的 skills/{roleId}/{skillId}/ 前缀下
    const blobPrefix = `skills/${roleId}/${skillId}/`;
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      let relPath = entry.entryName;
      if (rootPrefix) {
        if (!relPath.startsWith(rootPrefix)) continue; // 跳过 skill 目录之外的杂散文件
        relPath = relPath.slice(rootPrefix.length);
      }
      if (!relPath) continue;
      await blobPut(blobPrefix + relPath, entry.getData());
    }

    // 写入数据库元记录（upsert：skillId 存在则更新）
    await SkillDocModel.findOneAndUpdate(
      { roleId, skillId },
      {
        roleId,
        skillId,
        version: meta.version || "1.0.0",
        title,
        description: meta.description || "",
        md5,
        filePath: `skills/${roleId}/${skillId}`,
        blobPath: blobPrefix,
        enabled: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return NextResponse.json({
      skillId,
      roleId,
      title,
      md5,
      filePath: `skills/${roleId}/${skillId}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upload skill.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
