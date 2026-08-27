import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { signToken } from "@/lib/jwt";
import { COOKIE_NAME } from "@/lib/auth";
import type { UserDoc } from "@/types/db";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  const name = body.name?.trim();

  if (!email || !password) {
    return NextResponse.json({ error: "邮箱和密码不能为空" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
  }

  const db = await getDb();
  const existing = await db.collection<UserDoc>("users").findOne({ email });
  if (existing) {
    return NextResponse.json({ error: "该邮箱已注册" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();
  const userId = crypto.randomUUID();
  await db.collection<UserDoc>("users").insertOne({
    _id: userId,
    email,
    name: name || email.split("@")[0],
    passwordHash,
    createdAt: now,
  });

  const token = await signToken({ sub: userId, email });
  const res = NextResponse.json({
    user: { id: userId, email, name: name || email.split("@")[0] },
  });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
