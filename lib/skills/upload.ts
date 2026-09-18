/**
 * skill zip 上传核心(角色上传与全局库上传共用)。
 *
 * 流程:内存解压 → 定位 SKILL.md 解析 frontmatter → MD5 去重
 * (结构化拒绝码,前端据此分支:同名需确认后带 overwrite 重传)→
 * 覆盖升级时清旧文件 → 按 zip 原结构逐文件写 Vercel Blob 的
 * `skills/{roleId}/{skillId}/` 前缀 → upsert MongoDB 元数据。
 */
import { createHash } from "crypto";
import AdmZip from "adm-zip";
import { connectToMongo } from "@/lib/mongodb";
import { SkillDocModel } from "@/lib/models/skill-doc";
import { blobPut, blobListPathnames, blobDel, blobGetBuffer } from "@/lib/blob";
import { mapWithConcurrency } from "@/lib/utils";
import { parseFrontmatter } from "./index";

/** 全局 skill 固定挂在 general 角色前缀下(与 /api/admin/skills 约定一致) */
export const GLOBAL_SKILL_ROLE_ID = "general";

/** 结构化拒绝(DUPLICATE_CONTENT=同内容已存在;SKILL_ID_EXISTS=同 id 不同内容) */
export class SkillUploadRejected extends Error {
  code: "DUPLICATE_CONTENT" | "SKILL_ID_EXISTS";
  existing: { skillId: string; title: string; version: string };
  constructor(
    code: "DUPLICATE_CONTENT" | "SKILL_ID_EXISTS",
    existing: { skillId: string; title: string; version: string },
  ) {
    super(code);
    this.code = code;
    this.existing = existing;
  }
}

export type UploadSkillOptions = {
  /** 同 skillId 不同内容时是否覆盖升级(默认拒绝) */
  overwrite?: boolean;
  /** role=角色私有(默认);global=全局库(roleId 固定 general) */
  scope?: "role" | "global";
};

export async function uploadSkillZip(
  roleId: string,
  zipBuffer: Buffer,
  opts: UploadSkillOptions = {},
): Promise<{
  skillId: string;
  roleId: string;
  title: string;
  md5: string;
  filePath: string;
}> {
  const md5 = createHash("md5").update(zipBuffer).digest("hex");

  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  // 查找 SKILL.md(可能在根目录或一级子目录下)
  let skillMdEntry = entries.find((e) => e.entryName === "SKILL.md");
  if (!skillMdEntry) {
    skillMdEntry = entries.find((e) => e.entryName.endsWith("/SKILL.md"));
  }
  if (!skillMdEntry) {
    throw new Error("Zip archive must contain a SKILL.md file.");
  }

  const { meta } = parseFrontmatter(skillMdEntry.getData().toString("utf-8"));
  const skillId = meta.name || meta.id;
  if (!skillId) {
    throw new Error("SKILL.md frontmatter must contain a 'name' field.");
  }
  const title = meta.title || skillId;

  // zip 根目录前缀(如 "product-manager/"),读文件时去掉
  const rootPrefix = skillMdEntry.entryName.includes("/")
    ? skillMdEntry.entryName.split("/")[0] + "/"
    : null;

  await connectToMongo();

  const scope = opts.scope ?? "role";

  const existingByMd5 = await SkillDocModel.findOne(
    scope === "global" ? { roleId, scope: "global", md5 } : { roleId, md5 },
  ).lean();
  if (existingByMd5) {
    throw new SkillUploadRejected("DUPLICATE_CONTENT", {
      skillId: existingByMd5.skillId,
      title: existingByMd5.title,
      version: existingByMd5.version ?? "1.0.0",
    });
  }

  const existingById =
    scope === "global"
      ? await SkillDocModel.findOne({ roleId, scope: "global", skillId }).lean()
      : await SkillDocModel.findOne({ roleId, skillId }).lean();
  if (existingById && !opts.overwrite) {
    throw new SkillUploadRejected("SKILL_ID_EXISTS", {
      skillId: existingById.skillId,
      title: existingById.title,
      version: existingById.version ?? "1.0.0",
    });
  }

  const blobPrefix = `skills/${roleId}/${skillId}/`;

  // 覆盖升级:先清掉旧 zip 的全部文件,避免旧结构残留
  if (existingById) {
    try {
      const oldPathnames = await blobListPathnames(blobPrefix);
      if (oldPathnames.length > 0) await blobDel(oldPathnames);
    } catch {
      // 旧文件清理失败不阻断覆盖写入
    }
  }

  // 远程 Blob 单次往返数百毫秒,并发写入(上限 6)避免随文件数线性变慢
  const files = entries.flatMap((entry) => {
    if (entry.isDirectory) return [];
    let relPath = entry.entryName;
    if (rootPrefix) {
      if (!relPath.startsWith(rootPrefix)) return []; // skill 目录之外的杂散文件
      relPath = relPath.slice(rootPrefix.length);
    }
    if (!relPath) return [];
    return [{ path: blobPrefix + relPath, data: entry.getData() }];
  });
  await mapWithConcurrency(files, 6, (f) => blobPut(f.path, f.data));

  await SkillDocModel.findOneAndUpdate(
    scope === "global"
      ? { roleId, scope: "global", skillId }
      : { roleId, skillId },
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
      scope,
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  return {
    skillId,
    roleId,
    title,
    md5,
    filePath: `skills/${roleId}/${skillId}`,
  };
}

/** 删除一个 skill 的元数据 + Blob 文件(scope 区分全局/角色) */
export async function deleteSkill(
  roleId: string,
  skillId: string,
  scope: "role" | "global" = "role",
) {
  await connectToMongo();
  const filter =
    scope === "global"
      ? { roleId, scope: "global", skillId }
      : { roleId, skillId };
  const doc = await SkillDocModel.findOneAndDelete(filter).lean();
  if (!doc) throw new Error("Skill not found.");

  if (doc.blobPath) {
    try {
      const pathnames = await blobListPathnames(doc.blobPath);
      if (pathnames.length > 0) await blobDel(pathnames);
    } catch {
      // Blob 已不存在则忽略
    }
  }
  return { deleted: true, skillId, roleId };
}

/**
 * 将角色私有 skill 发布为全局 skill(管理员专用,API 层守卫)。
 * Blob 文件逐个拷贝到 skills/general/{skillId}/ 前缀,元数据提升为
 * scope=global;目标已存在且未 overwrite 时结构化拒绝(前端 409 确认后重试)。
 * 原角色私有副本保留不动。
 */
export async function publishSkillToGlobal(
  sourceRoleId: string,
  skillId: string,
  opts: { overwrite?: boolean } = {},
): Promise<{ skillId: string; title: string; version: string }> {
  await connectToMongo();

  // scope 字段出现前上传的老角色 skill 可能没有该字段
  const src = await SkillDocModel.findOne({
    roleId: sourceRoleId,
    skillId,
    $or: [{ scope: "role" }, { scope: { $exists: false } }],
  }).lean();
  if (!src) throw new Error("Skill not found.");
  const blobPath = src.blobPath ?? `skills/${sourceRoleId}/${skillId}/`;

  const existing = await SkillDocModel.findOne({
    roleId: GLOBAL_SKILL_ROLE_ID,
    scope: "global",
    skillId,
  }).lean();
  if (existing && !opts.overwrite) {
    throw new SkillUploadRejected("SKILL_ID_EXISTS", {
      skillId: existing.skillId,
      title: existing.title,
      version: existing.version ?? "1.0.0",
    });
  }

  const targetPrefix = `skills/${GLOBAL_SKILL_ROLE_ID}/${skillId}/`;

  // 覆盖发布:先清全局旧文件,避免旧结构残留
  if (existing) {
    try {
      const oldPathnames = await blobListPathnames(targetPrefix);
      if (oldPathnames.length > 0) await blobDel(oldPathnames);
    } catch {
      // 旧文件清理失败不阻断写入
    }
  }

  // Blob 无服务端拷贝 API,逐文件读源写目标(并发 6,与上传一致)
  const srcPathnames = await blobListPathnames(blobPath);
  await mapWithConcurrency(srcPathnames, 6, async (p) => {
    const data = await blobGetBuffer(p);
    if (data) {
      await blobPut(targetPrefix + p.slice(blobPath.length), data);
    }
  });

  await SkillDocModel.findOneAndUpdate(
    { roleId: GLOBAL_SKILL_ROLE_ID, scope: "global", skillId },
    {
      roleId: GLOBAL_SKILL_ROLE_ID,
      skillId,
      version: src.version ?? "1.0.0",
      title: src.title,
      description: src.description ?? "",
      md5: src.md5,
      filePath: `skills/${GLOBAL_SKILL_ROLE_ID}/${skillId}`,
      blobPath: targetPrefix,
      enabled: true,
      scope: "global",
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  return { skillId, title: src.title, version: src.version ?? "1.0.0" };
}
