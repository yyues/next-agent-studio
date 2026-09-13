/**
 * POST /api/register — 邮箱注册新用户并直接登录(设置 cookie)
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  AUTH_COOKIE,
  AUTH_MAX_AGE,
  signAuthToken,
  getAuthCredentials,
} from "@/lib/auth";
import {
  createUserAccount,
  normalizeEmail,
  EMAIL_PATTERN,
} from "@/lib/auth-server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
    };
    const email = normalizeEmail(body.email ?? "");
    const password = body.password ?? "";

    if (!email || !password) {
      return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    }
    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
    }
    if (password.length < 6 || password.length > 72) {
      return NextResponse.json({ error: "INVALID_PASSWORD" }, { status: 400 });
    }
    // 不允许注册占用内置账号名
    if (email === normalizeEmail(getAuthCredentials().username)) {
      return NextResponse.json({ error: "EMAIL_TAKEN" }, { status: 409 });
    }

    const result = await createUserAccount(email, password);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 409 });
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
    console.error("[register] failed:", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
