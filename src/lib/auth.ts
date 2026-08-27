import { cookies } from "next/headers";
import { getDb } from "@/lib/mongodb";
import { verifyToken } from "@/lib/jwt";
import type { UserDoc } from "@/types/db";

export const COOKIE_NAME = "auth_token";

// 用于 Next.js 服务端：从 cookie 解析当前登录用户
export async function getCurrentUser(): Promise<UserDoc | null> {
  const tokenStore = await cookies();
  const token = tokenStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;

  const db = await getDb();
  const user = await db.collection<UserDoc>("users").findOne(
    { _id: payload.sub },
    { projection: { passwordHash: 0 } },
  );
  return user;
}
