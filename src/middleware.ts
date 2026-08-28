import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/jwt";

// 仅登录用户可访问的路径前缀
const LOGIN_REQUIRED_PREFIXES = ["/api/chat/conversations"];
// 管理员专属路径前缀（页面 + API）
const ADMIN_ONLY_PREFIXES = ["/admin", "/api/admin"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const needLogin = LOGIN_REQUIRED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  const needAdmin = ADMIN_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!needLogin && !needAdmin) {
    return NextResponse.next();
  }

  const token = request.cookies.get("auth_token")?.value;
  const payload = token ? await verifyToken(token) : null;

  // ---- 未登录处理 ----
  if (!payload) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "未登录或登录已过期" }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ---- 管理员校验（仅依赖 JWT 中的 role，不查 DB） ----
  // Edge Runtime 不支持 mongodb，DB 回查由 API 路由内部的 requireAdmin() 兜底
  if (needAdmin && payload.role !== "admin") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
    }
    const home = request.nextUrl.clone();
    home.pathname = "/chat";
    home.searchParams.delete("from");
    home.searchParams.set("denied", "1");
    return NextResponse.redirect(home);
  }

  const res = NextResponse.next();
  res.headers.set("x-user-id", payload.sub);
  res.headers.set("x-user-email", payload.email);
  if (payload.role) res.headers.set("x-user-role", payload.role);
  return res;
}

export const config = {
  matcher: ["/api/chat/conversations/:path*", "/api/admin/:path*", "/admin/:path*"],
};
