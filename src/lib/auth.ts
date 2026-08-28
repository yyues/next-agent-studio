import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { verifyToken } from "@/lib/jwt";
import type { UserDoc } from "@/types/db";
import type { UserRole } from "@/types/db";

export const COOKIE_NAME = "auth_token";

// 用于 Next.js 服务端：从 cookie 解析当前登录用户（返回密码以外字段）
export async function getCurrentUser(): Promise<UserDoc | null> {
  const tokenStore = await cookies();
  const token = tokenStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;

  const db = await getDb();
  const user = await db
    .collection<UserDoc>("users")
    .findOne({ _id: payload.sub }, { projection: { passwordHash: 0 } });
  if (!user) return null;
  // 兼容老数据：role 缺失时默认 user
  if (!user.role) user.role = "user";
  return user;
}

/**
 * 判断是否管理员
 */
export function isAdmin(user: UserDoc | null): boolean {
  return !!user && (user.role ?? "user") === "admin";
}

/**
 * 后台 API 路由统一鉴权：
 * - 未登录返回 401
 * - 非管理员返回 403
 * - 通过后返回 user 对象
 */
export async function requireAdmin(
  req?: NextRequest,
): Promise<{ user: UserDoc; error?: NextResponse }> {
  let user: UserDoc | null = null;
  // server action / GET: cookies() 读取；middleware: 传入 request 直接从 header 读
  if (req) {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? await verifyToken(token) : null;
    if (payload) {
      const db = await getDb();
      user = await db
        .collection<UserDoc>("users")
        .findOne({ _id: payload.sub }, { projection: { passwordHash: 0 } });
      if (user && !user.role) user.role = "user" as UserRole;
    }
  } else {
    user = await getCurrentUser();
  }

  if (!user) {
    return { user: {} as UserDoc, error: NextResponse.json({ error: "未登录" }, { status: 401 }) };
  }
  if (!isAdmin(user)) {
    return { user, error: NextResponse.json({ error: "需要管理员权限" }, { status: 403 }) };
  }
  return { user };
}
