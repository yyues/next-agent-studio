import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { inspectMcpServer } from "@/lib/mcp/client";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> },
) {
  try {
    const { serverId } = await params;
    const url = new URL(req.url);
    const userId = await getAuthUserId(req, url.searchParams.get("userId"));
    const roleId = url.searchParams.get("roleId") ?? "general";
    return NextResponse.json(await inspectMcpServer({ userId, roleId, serverId }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to inspect MCP server." },
      { status: 502 },
    );
  }
}
