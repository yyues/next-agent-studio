/**
 * GET  /api/settings/roles/[roleId]/mcp — 列出该角色的 MCP server 配置
 * POST /api/settings/roles/[roleId]/mcp — 新增/更新 MCP server
 * PUT  /api/settings/roles/[roleId]/mcp?serverId=xxx — 连通性测试
 */
import { NextResponse } from "next/server";
import { normalizeUserId } from "@/lib/server-settings";
import {
  listMcpServers,
  upsertMcpServer,
  testMcpServer,
} from "@/lib/mcp/client";

function getUserId(req: Request) {
  const url = new URL(req.url);
  return normalizeUserId(
    url.searchParams.get("userId") ?? req.headers.get("x-user-id"),
  );
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  try {
    const { roleId } = await params;
    const servers = await listMcpServers(getUserId(req), roleId);
    return NextResponse.json({
      servers: servers.map(({ headers, ...rest }) => ({
        ...rest,
        headerKeys: Object.keys(headers),
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list MCP servers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  try {
    const { roleId } = await params;
    const userId = getUserId(req);
    const body = (await req.json()) as {
      serverId?: string;
      name: string;
      url: string;
      headers?: Record<string, string>;
      enabled?: boolean;
    };
    const server = await upsertMcpServer(userId, roleId, body);
    const { headers, ...rest } = server;
    return NextResponse.json({ server: { ...rest, headerKeys: Object.keys(headers) } });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save MCP server.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  void params;
  try {
    const body = (await req.json()) as {
      url: string;
      headers?: Record<string, string>;
    };
    const result = await testMcpServer(body);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "MCP connection failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
