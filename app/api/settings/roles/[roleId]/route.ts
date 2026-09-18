import { NextResponse } from "next/server";
import { updateRole, deleteRole, getRoleById } from "@/lib/server-settings";
import { getAuthUserId } from "@/lib/auth-request";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  try {
    const { roleId } = await params;
    const url = new URL(req.url);
    const userId = await getAuthUserId(
      req,
      url.searchParams.get("userId") ?? req.headers.get("x-user-id"),
    );

    const result = await getRoleById(userId, roleId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch role.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}


export async function PUT(
  req: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  try {
    const { roleId } = await params;
    const payload = (await req.json()) as {
      userId?: string;
      displayName?: string;
      description?: string;
      systemPrompt?: string;
      enabled?: boolean;
      priority?: number;
      suggestions?: string[];
      /** 引用挂载的外部 skill 键列表(整体替换) */
      skillIds?: string[];
      /** 引用挂载的外部 MCP 键列表(整体替换) */
      mcpRefs?: string[];
      /** 发布为通用角色/下架(仅管理员) */
      visibility?: "private" | "public";
    };

    const userId = await getAuthUserId(req, payload.userId ?? req.headers.get("x-user-id"));
    const role = await updateRole(userId, roleId, {
      displayName: payload.displayName,
      description: payload.description,
      systemPrompt: payload.systemPrompt,
      enabled: payload.enabled,
      priority: payload.priority,
      suggestions: payload.suggestions,
      skillIds: payload.skillIds,
      mcpRefs: payload.mcpRefs,
      visibility: payload.visibility,
    });

    return NextResponse.json({ role });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update role.";
    const status = message.includes("admins") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  try {
    const { roleId } = await params;
    const url = new URL(req.url);
    const userId = await getAuthUserId(
      req,
      url.searchParams.get("userId") ?? req.headers.get("x-user-id"),
    );

    await deleteRole(userId, roleId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete role.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
