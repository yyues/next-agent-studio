import { AUTH_COOKIE, verifyAuthToken } from "./auth";

/**
 * 从请求中解析登录用户 id:优先认证 cookie(签名 token,不可伪造),
 * 无 cookie 时回退客户端显式传入的 fallback(query/body/header 的 userId)。
 * 所有按用户隔离的 API 路由统一使用本函数。
 */
export async function getAuthUserId(
  req: Request,
  fallback?: unknown,
): Promise<string> {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${AUTH_COOKIE}=([^;]*)`),
  );
  const token = match?.[1] ? decodeURIComponent(match[1]) : undefined;
  try {
    const user = await verifyAuthToken(token);
    if (user) return user;
  } catch {
    // 无效 token 视为未登录
  }

  const raw = typeof fallback === "string" ? fallback.trim() : "";
  return raw || "demo-user";
}
