import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { listMcpInvocationLogs } from "@/lib/mcp/client";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = await getAuthUserId(req, url.searchParams.get("userId"));
    const limit = Number(url.searchParams.get("limit") ?? 50);
    return NextResponse.json({ logs: await listMcpInvocationLogs(userId, limit) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list MCP logs." },
      { status: 400 },
    );
  }
}
