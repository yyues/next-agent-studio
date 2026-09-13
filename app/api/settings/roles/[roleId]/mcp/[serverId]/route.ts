/**
 * DELETE /api/settings/roles/[roleId]/mcp/[serverId] — 删除 MCP server 配置
 */
import { NextResponse } from "next/server";
import { normalizeUserId } from "@/lib/server-settings";
import { deleteMcpServer } from "@/lib/mcp/client";
import { getAuthUserId } from "@/lib/auth-request";

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
    await deleteMcpServer(userId, roleId, serverId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete MCP server.";
    const status = message === "MCP server not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
