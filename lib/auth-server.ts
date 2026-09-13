/**
 * 服务端账号校验/创建(Node 运行时,API 路由专用)。
 * 账号标识为邮箱;登录顺序:env 内置账号(admin)→ MongoDB 注册用户。
 */
import "server-only";
import { connectToMongo } from "@/lib/mongodb";
import { UserAccountModel } from "@/lib/models/user-account";
import { hashPassword, verifyPassword } from "@/lib/password";
import { validateCredentials } from "@/lib/auth";

// 常规邮箱格式(实用优先,不做过度严格的 RFC 校验)
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function verifyLoginCredentials(email: string, password: string) {
  // env 内置账号(如 admin,AUTH_EMAIL/AUTH_USERNAME 均可)
  if (validateCredentials(email, password)) return true;

  await connectToMongo();
  const user = await UserAccountModel.findOne({ email: normalizeEmail(email) }).lean();
  if (!user) return false;
  return verifyPassword(password, user.salt, user.passwordHash);
}

export async function createUserAccount(email: string, password: string) {
  const normalized = normalizeEmail(email);
  await connectToMongo();
  const existing = await UserAccountModel.findOne({ email: normalized }).lean();
  if (existing) return { ok: false as const, reason: "EMAIL_TAKEN" as const };
  const { salt, passwordHash } = await hashPassword(password);
  await UserAccountModel.create({ email: normalized, salt, passwordHash });
  return { ok: true as const };
}
