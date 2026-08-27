import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/jwt";

// 受保护路径前缀：仅会话持久化接口强制登录
// /chat 页面与 /api/chat/stream 的访问控制由路由内部根据 ALLOW_GUEST_CHAT 决定
const PROTECTED_PREFIXES = ["/api/chat/conversations"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /api/chat/stream 与 /chat 页面本身的访问控制由路由内部根据
  // ALLOW_GUEST_CHAT 决定，这里只守会话持久化相关接口
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const token = request.cookies.get("auth_token")?.value;
  const payload = token ? await verifyToken(token) : null;

  if (!payload) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "未登录或登录已过期" }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const res = NextResponse.next();
  res.headers.set("x-user-id", payload.sub);
  res.headers.set("x-user-email", payload.email);
  return res;
}

export const config = {
  matcher: ["/api/chat/conversations/:path*"],
};
