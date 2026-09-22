import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin";
import { inspectMcpServer, listGlobalMcpServers } from "@/lib/mcp/client";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> },
) {
  const admin = await requireAdminUser(req);
  if (!admin) return NextResponse.json({ error: "Admin required." }, { status: 403 });
  try {
    const { serverId } = await params;
    const server = (await listGlobalMcpServers()).find((item) => item.serverId === serverId);
    if (!server) return NextResponse.json({ error: "MCP server not found." }, { status: 404 });
    return NextResponse.json(await inspectMcpServer({ userId: admin.userId, roleId: "__global__", serverId, server }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to inspect MCP server." },
      { status: 502 },
    );
  }
}
