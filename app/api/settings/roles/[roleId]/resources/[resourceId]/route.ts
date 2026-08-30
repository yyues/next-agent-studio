/**
 * DELETE /api/settings/roles/[roleId]/resources/[resourceId]
 */
import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { connectToMongo } from "@/lib/mongodb";
import { RoleResourceModel } from "@/lib/models/role-resource";

const RESOURCES_ROOT = resolve(process.cwd(), "resources");

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ roleId: string; resourceId: string }> },
) {
  try {
    const { roleId, resourceId } = await params;

    await connectToMongo();
    const result = await RoleResourceModel.deleteOne({ roleId, resourceId });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Resource not found." }, { status: 404 });
    }

    const targetDir = join(RESOURCES_ROOT, roleId, resourceId);
    if (existsSync(targetDir)) {
      const { rmSync } = require("fs");
      rmSync(targetDir, { recursive: true, force: true });
    }

    return NextResponse.json({ deleted: true, roleId, resourceId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete resource.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
