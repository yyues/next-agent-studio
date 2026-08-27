import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  testProviderConnection,
  resolveProviderConfigForUser,
} from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 测试连接：请求 /models 端点（毫秒级），验证 API Key + 端点可达 + model 存在
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user && process.env.ALLOW_GUEST_CHAT !== "true") {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: { apiKey?: string; baseUrl?: string; model?: string } = {};
  try {
    body = await request.json();
  } catch {
    // 允许空 body，用 DB/env 配置测试
  }

  let config;
  try {
    config = await resolveProviderConfigForUser(user?._id, body);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "配置错误" },
      { status: 400 },
    );
  }

  const result = await testProviderConnection(config);
  return NextResponse.json(result);
}
