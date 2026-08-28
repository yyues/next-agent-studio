import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import type { UserDoc, UserRole } from "@/types/db";
import bcrypt from "bcryptjs";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/admin/users/[id]
 * 修改：name / role / resetPassword
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const { id } = await params;
  let body: {
    name?: string;
    role?: UserRole;
    password?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const db = await getDb();
  const col = db.collection<UserDoc>("users");
  const existing = await col.findOne({ _id: id });
  if (!existing) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    update.name = body.name.trim();
  }
  if (body.role === "admin" || body.role === "user") {
    // 至少保留一个管理员：若要把最后一个 admin 改为 user，禁止
    if (existing.role === "admin" && body.role === "user") {
      const adminCount = await col.countDocuments({ role: "admin" });
      if (adminCount <= 1) {
        return NextResponse.json({ error: "至少需要保留一个管理员" }, { status: 400 });
      }
    }
    update.role = body.role;
  }
  if (typeof body.password === "string") {
    if (body.password.length < 6) {
      return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
    }
    update.passwordHash = await bcrypt.hash(body.password, 10);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  await col.updateOne({ _id: id }, { $set: update });

  const updated = await col.findOne({ _id: id }, { projection: { passwordHash: 0 } });
  return NextResponse.json({ ok: true, user: updated });
}

/**
 * DELETE /api/admin/users/[id]
 * 删除用户
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const { id } = await params;

  const db = await getDb();
  const col = db.collection<UserDoc>("users");
  const existing = await col.findOne({ _id: id });
  if (!existing) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }
  if ((existing.role ?? "user") === "admin") {
    const adminCount = await col.countDocuments({ role: "admin" });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "至少需要保留一个管理员，无法删除最后一个管理员" },
        { status: 400 },
      );
    }
  }

  // 删除用户相关资源（会话、消息、provider 配置）
  await Promise.all([
    db.collection("conversations").deleteMany({ userId: id }),
    db.collection("messages").deleteMany({ userId: id }),
    db.collection("provider_settings").deleteMany({ userId: id }),
    col.deleteOne({ _id: id }),
  ]);

  return NextResponse.json({ ok: true });
}
