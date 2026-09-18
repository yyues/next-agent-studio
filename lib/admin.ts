/**
 * 管理员判定与守卫。
 *
 * 管理员 = UserAccount.isAdmin 为 true(手动改库设定,无管理 UI)。
 * 权限范围:编辑/删除通用角色(内置+已发布)、上传/删除通用角色与全局库的
 * skill/MCP、发布/下架自己的角色为通用、访问 /admin 维护页与 /api/admin/*。
 * env 内置账号(AUTH_USERNAME)不在 UserAccount 集合中,需插入一条
 * { email, isAdmin: true } 记录才具备管理员权限(登录仍走 env 凭据路径)。
 */
import { connectToMongo } from "@/lib/mongodb";
import { UserAccountModel } from "@/lib/models/user-account";
import { getAuthUserId } from "@/lib/auth-request";

const CACHE_TTL_MS = 60 * 1000;

type AdminCacheEntry = { value: boolean; expireAt: number };

declare global {
  // eslint-disable-next-line no-var
  var __adminCache: Map<string, AdminCacheEntry> | undefined;
}

// 挂 globalThis 防 dev 热重载丢缓存;60s TTL 兼容手动改库后的生效延迟
const cache: Map<string, AdminCacheEntry> = global.__adminCache ?? new Map();
if (!global.__adminCache) global.__adminCache = cache;

export async function isAdminUser(userId: string): Promise<boolean> {
  const hit = cache.get(userId);
  if (hit && hit.expireAt > Date.now()) return hit.value;

  let value = false;
  try {
    await connectToMongo();
    const account = await UserAccountModel.findOne({ email: userId })
      .select("isAdmin")
      .lean();
    value = Boolean(account?.isAdmin);
  } catch {
    value = false;
  }
  cache.set(userId, { value, expireAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/** 手动改库设定管理员后,可等 TTL 自然过期(60s 内生效) */
export function invalidateAdminCache(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
}

/**
 * API 守卫:解析请求用户并校验管理员。
 * 返回 null 表示当前用户不是管理员(路由应回 403)。
 */
export async function requireAdminUser(
  req: Request,
  fallback?: unknown,
): Promise<{ userId: string } | null> {
  const userId = await getAuthUserId(req, fallback);
  if (!(await isAdminUser(userId))) return null;
  return { userId };
}
