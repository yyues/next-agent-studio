import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { listEffectiveMcpServers } from "@/lib/mcp/client";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = await getAuthUserId(req, url.searchParams.get("userId"));
    const roleId = url.searchParams.get("roleId") ?? "general";
    const servers = await listEffectiveMcpServers(userId, roleId);
    return NextResponse.json({
      servers: servers.map(({ headers, env, ...server }) => ({
        ...server,
        headerKeys: Object.keys(headers),
        envKeys: Object.keys(env),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list MCP servers." },
      { status: 400 },
    );
  }
}
