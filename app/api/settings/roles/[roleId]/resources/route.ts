/**
 * GET  /api/settings/roles/[roleId]/resources — 列出该角色所有 RAG 资料
 * POST /api/settings/roles/[roleId]/resources — 上传资料 zip 包
 */
import { NextResponse } from "next/server";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "fs";
import { join, resolve, basename } from "path";
import { createHash } from "crypto";
import AdmZip from "adm-zip";
import { connectToMongo } from "@/lib/mongodb";
import { RoleResourceModel } from "@/lib/models/role-resource";
import { ensureRoleResourceDir } from "@/lib/resources";

const RESOURCES_ROOT = resolve(process.cwd(), "resources");

function sanitizeName(name: string): string {
  return name
    .replace(/\.zip$/i, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 64)
    || "resource";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  try {
    const { roleId } = await params;
    await connectToMongo();
    const docs = await RoleResourceModel.find({ roleId }).lean();
    return NextResponse.json({
      resources: docs.map((d) => ({
        resourceId: d.resourceId,
        fileName: d.fileName,
        filePath: d.filePath,
        createdAt: d.createdAt,
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list resources.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  try {
    const { roleId } = await params;

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing 'file' field with a zip archive." },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const zipBuffer = Buffer.from(arrayBuffer);
    const md5 = createHash("md5").update(zipBuffer).digest("hex");

    await connectToMongo();
    const existing = await RoleResourceModel.findOne({ roleId, md5 }).lean();
    if (existing) {
      return NextResponse.json(
        { error: "A resource with identical content already exists.", existing },
        { status: 409 },
      );
    }

    const resourceId = sanitizeName(file.name);
    const roleDir = ensureRoleResourceDir(roleId);
    const targetDir = join(roleDir, resourceId);

    // 如果同名目录已存在，先清理
    if (existsSync(targetDir)) {
      const { rmSync } = require("fs");
      rmSync(targetDir, { recursive: true, force: true });
    }
    mkdirSync(targetDir, { recursive: true });

    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    // 检测根目录前缀并去掉
    const firstDir = entries.find((e) => e.isDirectory);
    const rootPrefix =
      firstDir && entries.every((e) => e.entryName.startsWith(firstDir.entryName))
        ? firstDir.entryName
        : null;

    for (const entry of entries) {
      const entryName = rootPrefix
        ? entry.entryName.startsWith(rootPrefix)
          ? entry.entryName.slice(rootPrefix.length)
          : entry.entryName
        : entry.entryName;

      if (!entryName) continue;

      const fullPath = join(targetDir, entryName);
      if (entry.isDirectory) {
        mkdirSync(fullPath, { recursive: true });
      } else {
        const parentDir = fullPath.substring(0, fullPath.lastIndexOf("/"));
        if (!existsSync(parentDir)) mkdirSync(parentDir, { recursive: true });
        writeFileSync(fullPath, entry.getData());
      }
    }

    await RoleResourceModel.findOneAndUpdate(
      { roleId, resourceId },
      {
        roleId,
        resourceId,
        fileName: file.name,
        md5,
        filePath: `resources/${roleId}/${resourceId}`,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return NextResponse.json({ roleId, resourceId, fileName: file.name });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upload resource.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
