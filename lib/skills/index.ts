/**
 * Skills 加载器
 *
 * 数据来源（合并，DB 上传项覆盖同 id 的内置项）：
 * 1. 文件系统内置 skill —— 仓库提交的 skills/{roleId}/{skillId}/SKILL.md
 *    （在 Vercel 上提交文件可读，无需写入）
 * 2. 用户上传 skill —— 元数据存 MongoDB（SkillDoc），内容按 zip 原结构逐文件
 *    解压到 Vercel Blob 的 skills/{roleId}/{skillId}/ 前缀下
 *    （blobPath 存该前缀；加载时按前缀列出文件，读 SKILL.md/prompts/knowledge）
 *
 * 目录结构约定（内置与上传统一）：
 *   skills/{roleId}/{skillId}/
 *     SKILL.md         ← 必须，含 frontmatter 元数据 + 指令正文
 *     prompts/         ← 可选，prompt 模板
 *     knowledge/       ← 可选，知识库文档
 */
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import type { SkillModule } from "./types";
import { connectToMongo } from "@/lib/mongodb";
import { SkillDocModel } from "@/lib/models/skill-doc";
import { blobGetText, blobListPathnames, blobDel } from "@/lib/blob";

// 项目根目录下的 skills 文件夹
const SKILLS_ROOT = resolve(process.cwd(), "skills");

/**
 * 删除角色的所有上传 skill：清理 Vercel Blob + MongoDB 记录。
 * 内置 skill（仓库提交）不在 Blob/DB 中，不受影响。
 */
export async function removeRoleSkillDir(roleId: string): Promise<void> {
  try {
    await connectToMongo();
    await SkillDocModel.deleteMany({ roleId });
  } catch {
    // 数据库清理失败不阻断
  }
  try {
    const pathnames = await blobListPathnames(`skills/${roleId}/`);
    if (pathnames.length > 0) await blobDel(pathnames);
  } catch {
    // Blob 清理失败不阻断
  }
}

/**
 * 读取目录下所有子文件的内容，返回 string[]
 */
function readDirFiles(dirPath: string): string[] {
  if (!existsSync(dirPath)) return [];
  const entries = readdirSync(dirPath).filter((f) => {
    const stat = statSync(join(dirPath, f));
    return stat.isFile();
  });
  return entries.map((f) => readFileSync(join(dirPath, f), "utf-8"));
}

/**
 * 解析 SKILL.md 的 YAML frontmatter
 */
export function parseFrontmatter(
  raw: string,
): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };

  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) meta[key] = value;
  }
  return { meta, body: match[2].trim() };
}

/**
 * 从文件系统加载内置 skill（按 SKILL.md 扫描）
 */
async function loadBuiltinSkills(roleId: string): Promise<SkillModule[]> {
  const roleDir = join(SKILLS_ROOT, roleId);
  if (!existsSync(roleDir)) return [];

  const entries = readdirSync(roleDir).filter((name) => {
    const fullPath = join(roleDir, name);
    return statSync(fullPath).isDirectory();
  });

  const skills: SkillModule[] = [];

  for (const skillId of entries) {
    const skillDir = join(roleDir, skillId);
    const skillMdPath = join(skillDir, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;

    try {
      const raw = readFileSync(skillMdPath, "utf-8");
      const { meta, body } = parseFrontmatter(raw);
      const prompts = readDirFiles(join(skillDir, "prompts"));
      const knowledge = readDirFiles(join(skillDir, "knowledge"));

      skills.push({
        id: meta.name || meta.id || skillId,
        title: meta.title || meta.name || skillId,
        description: meta.description,
        instructions: body,
        prompts: prompts.length > 0 ? prompts : undefined,
        knowledge: knowledge.length > 0 ? knowledge : undefined,
        version: meta.version,
      });
    } catch {
      continue;
    }
  }

  return skills;
}

/**
 * 从 MongoDB + Vercel Blob 加载用户上传的 skill
 * （按 blobPath 前缀列出 zip 解压后的原始文件，读 SKILL.md + prompts/ + knowledge/）
 */
async function loadUploadedSkills(roleId: string): Promise<SkillModule[]> {
  try {
    await connectToMongo();
    const docs = await SkillDocModel.find({ roleId, enabled: true }).lean();
    const skills: SkillModule[] = [];
    for (const doc of docs) {
      const prefix = doc.blobPath || `skills/${roleId}/${doc.skillId}/`;
      const pathnames = await blobListPathnames(prefix);
      if (pathnames.length === 0) continue;

      // 找到 SKILL.md（前缀下任一层级，通常直接位于前缀下）
      const skillMdPath = pathnames.find((p) => p === `${prefix}SKILL.md`);
      if (!skillMdPath) continue;

      const raw = await blobGetText(skillMdPath);
      if (!raw) continue;
      const { body } = parseFrontmatter(raw);

      // 收集 prompts/ 与 knowledge/ 下的文件内容
      const promptsPrefix = `${prefix}prompts/`;
      const knowledgePrefix = `${prefix}knowledge/`;
      const prompts: string[] = [];
      const knowledge: string[] = [];
      for (const p of pathnames) {
        if (p.startsWith(promptsPrefix)) {
          const t = await blobGetText(p);
          if (t) prompts.push(t);
        } else if (p.startsWith(knowledgePrefix)) {
          const t = await blobGetText(p);
          if (t) knowledge.push(t);
        }
      }

      skills.push({
        id: doc.skillId,
        title: doc.title,
        description: doc.description,
        instructions: body,
        prompts: prompts.length > 0 ? prompts : undefined,
        knowledge: knowledge.length > 0 ? knowledge : undefined,
        version: doc.version,
      });
    }
    return skills;
  } catch {
    return [];
  }
}

/**
 * 加载指定角色的所有 skills：合并内置（文件系统）+ 上传（Blob/DB）。
 * 同 id 时上传项覆盖内置项。
 */
export async function loadSkillsByRoleId(
  roleId: string,
): Promise<SkillModule[]> {
  const [builtin, uploaded] = await Promise.all([
    loadBuiltinSkills(roleId),
    loadUploadedSkills(roleId),
  ]);

  const merged = new Map<string, SkillModule>();
  for (const s of builtin) merged.set(s.id, s);
  for (const s of uploaded) merged.set(s.id, s); // 上传项覆盖

  return Array.from(merged.values());
}

/**
 * 获取指定角色下所有可用的 skill ID 列表：合并内置 + 上传
 */
export async function getAvailableSkillIds(roleId: string): Promise<string[]> {
  const skills = await loadSkillsByRoleId(roleId);
  return skills.map((s) => s.id);
}
