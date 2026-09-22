import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin";
import { listMcpInvocationLogs } from "@/lib/mcp/client";

export async function GET(req: Request) {
  const admin = await requireAdminUser(req);
  if (!admin) return NextResponse.json({ error: "Admin required." }, { status: 403 });
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    return NextResponse.json({ logs: await listMcpInvocationLogs(admin.userId, limit) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list MCP logs." },
      { status: 400 },
    );
  }
}
