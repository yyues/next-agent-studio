/**
 * POST   /api/login — 登录(邮箱 + 密码,校验后设置 httpOnly 签名 cookie)
 * DELETE /api/login — 退出登录(清除 cookie)
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  AUTH_COOKIE,
  AUTH_MAX_AGE,
  signAuthToken,
} from "@/lib/auth";
import { verifyLoginCredentials, normalizeEmail } from "@/lib/auth-server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
    };
    const email = normalizeEmail(body.email ?? "");
    const password = body.password ?? "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "MISSING_FIELDS" },
        { status: 400 },
      );
    }

    if (!(await verifyLoginCredentials(email, password))) {
      return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
    }

    const token = await signAuthToken(email);
    const cookieStore = await cookies();
    cookieStore.set(AUTH_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: AUTH_MAX_AGE,
    });

    return NextResponse.json({ ok: true, email });
  } catch (error) {
    console.error("[/api/login]", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  return NextResponse.json({ ok: true });
}
