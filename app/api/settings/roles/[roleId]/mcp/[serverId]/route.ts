/**
 * PATCH  /api/settings/roles/[roleId]/mcp/[serverId] — 设置角色自动挂载状态
 * DELETE /api/settings/roles/[roleId]/mcp/[serverId] — 删除 MCP server 配置
 */
import { NextResponse } from "next/server";
import { assertRoleAccess } from "@/lib/server-settings";
import { deleteMcpServer, setRoleMcpMounted } from "@/lib/mcp/client";
import { getAuthUserId } from "@/lib/auth-request";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ roleId: string; serverId: string }> },
) {
  try {
    const { roleId, serverId } = await params;
    const body = (await req.json()) as {
      userId?: string;
      ref?: string | null;
      mounted?: boolean;
      inherit?: boolean;
    };
    if (!body.inherit && typeof body.mounted !== "boolean") {
      return NextResponse.json({ error: "mounted must be a boolean." }, { status: 400 });
    }
    const userId = await getAuthUserId(req, body.userId ?? req.headers.get("x-user-id"));
    const server = await setRoleMcpMounted({
      userId,
      roleId,
      serverId,
      ref: body.ref,
      mounted: body.mounted,
      inherit: body.inherit,
    });
    const { headers, env, ...rest } = server;
    return NextResponse.json({
      server: {
        ...rest,
        headerKeys: Object.keys(headers),
        envKeys: Object.keys(env),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update MCP mount.";
    const status =
      message.includes("admins") || message.includes("not found for this user")
        ? 403
        : message.includes("not found")
          ? 404
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ roleId: string; serverId: string }> },
) {
  try {
    const { roleId, serverId } = await params;
    const url = new URL(req.url);
    const userId = await getAuthUserId(
      req,
      url.searchParams.get("userId") ?? req.headers.get("x-user-id"),
    );
    // 通用角色(内置/已发布)仅管理员可删;他人私有角色 403
    await assertRoleAccess(userId, roleId);
    await deleteMcpServer(userId, roleId, serverId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete MCP server.";
    const status =
      message === "MCP server not found."
        ? 404
        : message.includes("admins") || message.includes("not found for this user")
          ? 403
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
