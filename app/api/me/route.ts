/**
 * GET /api/me — 当前登录用户信息(前端据 isAdmin 显示管理入口/只读态)
 */
import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { isAdminUser } from "@/lib/admin";

function fallbackUserId(req: Request) {
  const { searchParams } = new URL(req.url);
  return searchParams.get("userId") ?? req.headers.get("x-user-id") ?? undefined;
}

export async function GET(req: Request) {
  const userId = await getAuthUserId(req, fallbackUserId(req));
  return NextResponse.json({
    userId,
    isAdmin: await isAdminUser(userId),
  });
}
