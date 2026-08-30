import { NextResponse } from "next/server";
import { normalizeUserId, updateRole, deleteRole, getRoleById } from "@/lib/server-settings";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  try {
    const { roleId } = await params;
    const url = new URL(req.url);
    const userId = normalizeUserId(
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
    };

    const userId = normalizeUserId(payload.userId ?? req.headers.get("x-user-id"));
    const role = await updateRole(userId, roleId, {
      displayName: payload.displayName,
      description: payload.description,
      systemPrompt: payload.systemPrompt,
      enabled: payload.enabled,
      priority: payload.priority,
    });

    return NextResponse.json({ role });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update role.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  try {
    const { roleId } = await params;
    const url = new URL(req.url);
    const userId = normalizeUserId(
      url.searchParams.get("userId") ?? req.headers.get("x-user-id"),
    );

    await deleteRole(userId, roleId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete role.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
