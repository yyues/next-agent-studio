/**
 * Skills 加载器
 *
 * 核心职责：从 skills/{roleId}/ 目录扫描 skill 包，
 * 读取 SKILL.md（含 YAML frontmatter 元数据），
 * 返回 SkillModule[] 供 systemPrompt 拼装使用。
 *
 * 目录结构约定：
 *   skills/
 *     {roleId}/
 *       {skillId}/
 *         SKILL.md         ← 必须，含 frontmatter 元数据 + 指令正文
 *         prompts/         ← 可选，prompt 模板
 *         knowledge/       ← 可选，知识库文档
 */
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import type { SkillModule } from "./types";

// 项目根目录下的 skills 文件夹
const SKILLS_ROOT = resolve(process.cwd(), "skills");

/**
 * 确保角色的 skill 目录存在，不存在则创建
 */
export function ensureRoleSkillDir(roleId: string): string {
  const dir = join(SKILLS_ROOT, roleId);
  if (!existsSync(dir)) {
    const { mkdirSync } = require("fs");
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * 删除角色的整个 skill 目录
 */
export function removeRoleSkillDir(roleId: string): void {
  const dir = join(SKILLS_ROOT, roleId);
  if (existsSync(dir)) {
    const { rmSync } = require("fs");
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * 读取目录下所有子文件的内容，返回 string[]
 * 用于读取 prompts/ 和 knowledge/ 目录
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
 * 支持 name、title、description、version 等字段
 */
function parseFrontmatter(
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
 * 加载指定角色的所有 skills
 *
 * 扫描 skills/{roleId}/ 下的每个子目录，
 * 读取 SKILL.md 获取 frontmatter 元数据和指令内容。
 */
export async function loadSkillsByRoleId(
  roleId: string,
): Promise<SkillModule[]> {
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

    // 跳过没有 SKILL.md 的目录
    if (!existsSync(skillMdPath)) continue;

    try {
      const raw = readFileSync(skillMdPath, "utf-8");
      const { meta, body } = parseFrontmatter(raw);

      // 可选：读取 prompts/ 目录下的模板文件
      const prompts = readDirFiles(join(skillDir, "prompts"));

      // 可选：读取 knowledge/ 目录下的知识库文档
      const knowledge = readDirFiles(join(skillDir, "knowledge"));

      skills.push({
        id: meta.name || meta.id || skillId,
        title: meta.title || meta.name || skillId,
        instructions: body,
        prompts: prompts.length > 0 ? prompts : undefined,
        knowledge: knowledge.length > 0 ? knowledge : undefined,
        version: meta.version,
      });
    } catch {
      // 跳过解析失败的 skill，不影响其他 skill 加载
      continue;
    }
  }

  return skills;
}

/**
 * 获取指定角色下所有可用的 skill ID 列表
 */
export function getAvailableSkillIds(roleId: string): string[] {
  const roleDir = join(SKILLS_ROOT, roleId);
  if (!existsSync(roleDir)) return [];

  return readdirSync(roleDir).filter((name) => {
    const fullPath = join(roleDir, name);
    return (
      statSync(fullPath).isDirectory() &&
      existsSync(join(fullPath, "SKILL.md"))
    );
  });
}
