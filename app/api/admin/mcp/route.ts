/**
 * 全局 MCP 库维护(仅管理员,维护页 /admin 使用)。
 *
 * GET    /api/admin/mcp — 全局库列表
 * POST   /api/admin/mcp — 新增/更新
 * PUT    /api/admin/mcp — 连通性测试
 * DELETE /api/admin/mcp?serverId=xxx — 删除
 *
 * 全局 MCP 存 scope=global 行(userId=__system__/roleId=__global__);
 * 内置角色自动生效,自定义角色经引用挂载使用。
 */
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin";
import {
  listGlobalMcpServers,
  upsertGlobalMcpServer,
  deleteGlobalMcpServer,
  testMcpServer,
  type McpUpsertPayload,
} from "@/lib/mcp/client";

function deny() {
  return NextResponse.json({ error: "Admin required." }, { status: 403 });
}

export async function GET(req: Request) {
  if (!(await requireAdminUser(req))) return deny();
  try {
    const servers = await listGlobalMcpServers();
    return NextResponse.json({
      servers: servers.map(({ headers, env, ...rest }) => ({
        ...rest,
        headerKeys: Object.keys(headers),
        envKeys: Object.keys(env),
      })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list global MCP.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await requireAdminUser(req))) return deny();
  try {
    const body = (await req.json()) as McpUpsertPayload;
    const server = await upsertGlobalMcpServer(body);
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
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  // 连通性测试只依赖请求体里的 URL,不涉及库写放,同样限管理员
  if (!(await requireAdminUser(req))) return deny();
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

export async function DELETE(req: Request) {
  if (!(await requireAdminUser(req))) return deny();
  try {
    const serverId = new URL(req.url).searchParams.get("serverId");
    if (!serverId) {
      return NextResponse.json(
        { error: "serverId is required." },
        { status: 400 },
      );
    }
    return NextResponse.json(await deleteGlobalMcpServer(serverId));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete MCP server.";
    const status = message === "MCP server not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
