import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import type { CustomerDoc, CustomerStatus } from "@/types/db";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/admin/customers/[id]
 * 修改基础字段 / 状态 / 延期
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const { id } = await params;

  let body: {
    name?: string;
    email?: string;
    phone?: string;
    remark?: string;
    status?: CustomerStatus;
    linkedUserId?: string | null;
    expireAt?: string | null;
    /** 延期天数（正数延期，负数提前） */
    extendDays?: number;
    /** 直接设置为试用并给 N 天 */
    trialDays?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const db = await getDb();
  const col = db.collection<CustomerDoc>("customers");
  const oid = ObjectId.createFromHexString(id);
  const existing = await col.findOne({ _id: oid });
  if (!existing) {
    return NextResponse.json({ error: "客户不存在" }, { status: 404 });
  }

  const update: Record<string, unknown> = {};

  if (typeof body.name === "string") {
    const v = body.name.trim();
    if (!v) return NextResponse.json({ error: "客户名称不能为空" }, { status: 400 });
    update.name = v;
  }
  if (typeof body.email !== "undefined") update.email = body.email?.trim() || undefined;
  if (typeof body.phone !== "undefined") update.phone = body.phone?.trim() || undefined;
  if (typeof body.remark !== "undefined") update.remark = body.remark?.trim() || undefined;
  if (typeof body.linkedUserId !== "undefined") update.linkedUserId = body.linkedUserId ?? null;

  if (
    body.status === "active" ||
    body.status === "trial" ||
    body.status === "expired" ||
    body.status === "disabled"
  ) {
    update.status = body.status;
  }

  // 到期时间处理
  if (typeof body.expireAt !== "undefined") {
    update.expireAt = body.expireAt ? new Date(body.expireAt) : null;
  } else if (typeof body.trialDays === "number" && body.trialDays > 0) {
    const d = new Date();
    d.setDate(d.getDate() + body.trialDays);
    update.expireAt = d;
    update.status = update.status ?? "trial";
  } else if (typeof body.extendDays === "number") {
    const base =
      existing.expireAt && !isNaN(existing.expireAt.getTime()) ? existing.expireAt : new Date();
    const d = new Date(base.getTime());
    d.setDate(d.getDate() + body.extendDays);
    update.expireAt = d;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  update.updatedAt = new Date();
  await col.updateOne({ _id: oid }, { $set: update });
  const after = await col.findOne({ _id: oid });
  return NextResponse.json({ ok: true, customer: after });
}

/**
 * DELETE /api/admin/customers/[id]
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  const { id } = await params;

  const db = await getDb();
  const col = db.collection<CustomerDoc>("customers");
  const oid = ObjectId.createFromHexString(id);
  const r = await col.deleteOne({ _id: oid });
  if (r.deletedCount === 0) {
    return NextResponse.json({ error: "客户不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
