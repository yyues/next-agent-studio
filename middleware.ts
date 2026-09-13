import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { AUTH_COOKIE, verifyAuthToken } from "./lib/auth";

const intlMiddleware = createMiddleware(routing);

/**
 * next-intl 处理 locale;之后对 /chat /admin /settings 做登录守卫,
 * 未登录重定向到对应 locale 的 /login?from=<原路径>。
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected =
    /\/(chat|admin|settings)(\/|$)/.test(pathname) && !pathname.startsWith("/api");

  if (isProtected) {
    const token = req.cookies.get(AUTH_COOKIE)?.value;
    const user = await verifyAuthToken(token);
    if (!user) {
      // 取 URL 中的 locale 段,缺省让 next-intl 处理(跳 /login 由其补 locale)
      const locale = pathname.split("/")[1];
      const target = routing.locales.includes(locale as never)
        ? `/${locale}/login`
        : "/login";
      const loginUrl = new URL(target, req.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return intlMiddleware(req);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
