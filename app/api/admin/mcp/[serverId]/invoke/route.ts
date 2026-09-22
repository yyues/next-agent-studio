import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin";
import { invokeMcpTool, listGlobalMcpServers } from "@/lib/mcp/client";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> },
) {
  const admin = await requireAdminUser(req);
  if (!admin) return NextResponse.json({ error: "Admin required." }, { status: 403 });
  try {
    const { serverId } = await params;
    const body = (await req.json()) as {
      toolName?: string;
      arguments?: Record<string, unknown>;
      confirmed?: boolean;
    };
    if (!body.toolName) return NextResponse.json({ error: "toolName is required." }, { status: 400 });
    const server = (await listGlobalMcpServers()).find((item) => item.serverId === serverId);
    if (!server) return NextResponse.json({ error: "MCP server not found." }, { status: 404 });
    const result = await invokeMcpTool({
      userId: admin.userId,
      roleId: "__global__",
      serverId,
      toolName: body.toolName,
      arguments: body.arguments ?? {},
      confirmed: body.confirmed === true,
      server,
    });
    return NextResponse.json(result, { status: result.status === "denied" ? 409 : 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to invoke MCP tool." },
      { status: 400 },
    );
  }
}
