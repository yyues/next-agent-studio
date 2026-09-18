/**
 * GET  /api/settings/roles/[roleId]/mcp — 列出该角色的有效 MCP(自己的+引用的+内置含全局库)
 * POST /api/settings/roles/[roleId]/mcp — 新增/更新 MCP server(自己的角色;通用角色仅管理员)
 * PUT  /api/settings/roles/[roleId]/mcp?serverId=xxx — 连通性测试
 */
import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { assertRoleAccess } from "@/lib/server-settings";
import {
  listEffectiveMcpServers,
  upsertMcpServer,
  testMcpServer,
  type McpUpsertPayload,
} from "@/lib/mcp/client";

function getUserId(req: Request) {
  const url = new URL(req.url);
  return getAuthUserId(
      req,
      url.searchParams.get("userId") ?? req.headers.get("x-user-id"),
    );
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  try {
    const { roleId } = await params;
    const uid = await getUserId(req);
    const servers = await listEffectiveMcpServers(uid, roleId);
    return NextResponse.json({
      servers: servers.map(({ headers, env, ...rest }) => ({
        ...rest,
        headerKeys: Object.keys(headers),
        envKeys: Object.keys(env),
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
    const uid = await getUserId(req);
    // 通用角色(内置/已发布)仅管理员可改;他人私有角色 403
    await assertRoleAccess(uid, roleId);
    const body = (await req.json()) as McpUpsertPayload;
    const server = await upsertMcpServer(uid, roleId, body);
    const { headers, env, ...rest } = server;
    return NextResponse.json({
      server: {
        ...rest,
        headerKeys: Object.keys(headers),
        envKeys: Object.keys(env),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save MCP server.";
    const status =
      message.includes("admins") || message.includes("not found for this user")
        ? 403
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ roleId: string }> },
) {
  void params;
  try {
    const body = (await req.json()) as {
      type?: "http" | "stdio";
      url?: string;
      headers?: Record<string, string>;
      command?: string;
      args?: string[];
      env?: Record<string, string>;
    };
    const result = await testMcpServer(body);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "MCP connection failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
