import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { invokeMcpTool } from "@/lib/mcp/client";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ serverId: string }> },
) {
  const { serverId } = await params;
  try {
    const body = (await req.json()) as {
      userId?: string;
      roleId?: string;
      toolName?: string;
      arguments?: Record<string, unknown>;
      confirmed?: boolean;
    };
    const userId = await getAuthUserId(req, body.userId);
    if (!body.roleId || !body.toolName) {
      return NextResponse.json({ error: "roleId and toolName are required." }, { status: 400 });
    }
    const result = await invokeMcpTool({
      userId,
      roleId: body.roleId,
      serverId,
      toolName: body.toolName,
      arguments: body.arguments ?? {},
      confirmed: body.confirmed === true,
    });
    return NextResponse.json(result, { status: result.status === "denied" ? 409 : 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to invoke MCP tool." },
      { status: 400 },
    );
  }
}
