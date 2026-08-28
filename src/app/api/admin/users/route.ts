import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import type { UserDoc, UserRole } from "@/types/db";
import bcrypt from "bcryptjs";

/**
 * GET /api/admin/users
 * 列表（分页）
 */
export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.max(1, Math.min(100, Number(searchParams.get("pageSize") ?? 20)));
  const keyword = (searchParams.get("keyword") ?? "").trim();

  const db = await getDb();
  const col = db.collection<UserDoc>("users");

  const filter: Record<string, unknown> = {};
  if (keyword) {
    filter.$or = [
      { email: { $regex: keyword, $options: "i" } },
      { name: { $regex: keyword, $options: "i" } },
    ];
  }

  const [total, list] = await Promise.all([
    col.countDocuments(filter),
    col
      .find(filter, {
        projection: { passwordHash: 0 },
        sort: { createdAt: -1 },
        skip: (page - 1) * pageSize,
        limit: pageSize,
      })
      .map((u) => ({
        id: u._id,
        email: u.email,
        name: u.name,
        role: u.role ?? ("user" as UserRole),
        createdAt: u.createdAt,
      }))
      .toArray(),
  ]);

  return NextResponse.json({ total, page, pageSize, list });
}

/**
 * POST /api/admin/users
 * 管理员创建新用户（指定邮箱/密码/角色）
 */
export async function POST(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  let body: {
    email?: string;
    password?: string;
    name?: string;
    role?: UserRole;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  const name = body.name?.trim();
  const role: UserRole = body.role === "admin" ? "admin" : "user";

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
    role,
    createdAt: now,
  });

  return NextResponse.json({
    ok: true,
    user: { id: userId, email, name: name || email.split("@")[0], role, createdAt: now },
  });
}
