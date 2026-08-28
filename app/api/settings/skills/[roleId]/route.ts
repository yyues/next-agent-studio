/**
 * GET  /api/settings/skills/[roleId] — 查询某角色的 skills
 * POST /api/settings/skills/[roleId] — 上传 skill zip 包到指定角色
 *
 * 上传流程：
 * 1. 接收 multipart/form-data 中的 zip 文件
 * 2. 解压到临时目录，读取 manifest.json
 * 3. 计算 zip 文件 MD5，查数据库去重
 * 4. 移动到 skills/{roleId}/{skillId}/ 目录
 * 5. 写入 MongoDB 元数据记录
 */
import { NextResponse } from "next/server";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { createHash } from "crypto";
import AdmZip from "adm-zip";
import { connectToMongo } from "@/lib/mongodb";
import { SkillDocModel } from "@/lib/models/skill-doc";

const SKILLS_ROOT = resolve(process.cwd(), "skills");

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  try {
    const { roleId } = await params;
    const roleDir = join(SKILLS_ROOT, roleId);

    if (!existsSync(roleDir)) {
      return NextResponse.json({ skills: [] });
    }

    const skillDirs = readdirSync(roleDir).filter((name) =>
      statSync(join(roleDir, name)).isDirectory(),
    );

    const skills = skillDirs
      .map((skillId) => {
        const manifestPath = join(roleDir, skillId, "manifest.json");
        if (!existsSync(manifestPath)) return null;
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
          return {
            skillId: manifest.id || skillId,
            roleId,
            title: manifest.title || skillId,
            description: manifest.description || "",
            version: manifest.version || "1.0.0",
            filePath: `skills/${roleId}/${skillId}`,
            enabled: true,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return NextResponse.json({ skills });
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

    // 解压到临时位置读取 manifest
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    // 查找 manifest.json（可能在根目录或一级子目录下）
    let manifestEntry = entries.find((e) => e.entryName === "manifest.json");
    if (!manifestEntry) {
      manifestEntry = entries.find((e) => e.entryName.endsWith("/manifest.json"));
    }
    if (!manifestEntry) {
      return NextResponse.json(
        { error: "Zip archive must contain a manifest.json file." },
        { status: 400 },
      );
    }

    const manifest = JSON.parse(manifestEntry.getData().toString("utf-8"));
    if (!manifest.id || !manifest.title) {
      return NextResponse.json(
        { error: "manifest.json must contain 'id' and 'title' fields." },
        { status: 400 },
      );
    }

    const skillId = manifest.id;
    const targetDir = join(SKILLS_ROOT, roleId, skillId);

    // 数据库去重校验
    await connectToMongo();
    const existingByMd5 = await SkillDocModel.findOne({ roleId, md5 }).lean();
    if (existingByMd5) {
      return NextResponse.json(
        { error: "A skill with identical content already exists.", existing: existingByMd5 },
        { status: 409 },
      );
    }

    // 确保目标父目录存在
    const roleDir = join(SKILLS_ROOT, roleId);
    if (!existsSync(roleDir)) {
      mkdirSync(roleDir, { recursive: true });
    }

    // 如果 skill 已存在，先清理旧目录
    if (existsSync(targetDir)) {
      const { rmSync } = require("fs");
      rmSync(targetDir, { recursive: true, force: true });
    }

    // 解压 zip 到目标目录
    // 如果 zip 内有根目录前缀（如 product-manager/manifest.json），
    // 需要去掉前缀直接解压到 targetDir
    const rootPrefix = manifestEntry.entryName.includes("/")
      ? manifestEntry.entryName.split("/")[0] + "/"
      : null;

    mkdirSync(targetDir, { recursive: true });

    for (const entry of entries) {
      const entryName = rootPrefix
        ? entry.entryName.startsWith(rootPrefix)
          ? entry.entryName.slice(rootPrefix.length)
          : entry.entryName
        : entry.entryName;

      if (!entryName) continue; // 跳过根目录自身

      const fullPath = join(targetDir, entryName);
      if (entry.isDirectory) {
        mkdirSync(fullPath, { recursive: true });
      } else {
        // 确保父目录存在
        const parentDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
        if (!existsSync(parentDir)) {
          mkdirSync(parentDir, { recursive: true });
        }
        writeFileSync(fullPath, entry.getData());
      }
    }

    // 写入数据库元记录（upsert：skillId 存在则更新）
    await SkillDocModel.findOneAndUpdate(
      { roleId, skillId },
      {
        roleId,
        skillId,
        version: manifest.version || "1.0.0",
        title: manifest.title,
        description: manifest.description || "",
        md5,
        filePath: `skills/${roleId}/${skillId}`,
        enabled: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return NextResponse.json({
      skillId,
      roleId,
      title: manifest.title,
      md5,
      filePath: `skills/${roleId}/${skillId}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upload skill.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
