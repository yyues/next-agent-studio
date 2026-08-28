import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import type { CustomerDoc, CustomerStatus } from "@/types/db";
import { ObjectId } from "mongodb";

/**
 * GET /api/admin/customers
 * 分页列表，支持 keyword/status 筛选
 */
export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.max(1, Math.min(100, Number(searchParams.get("pageSize") ?? 20)));
  const keyword = (searchParams.get("keyword") ?? "").trim();
  const statusQ = searchParams.get("status") as CustomerStatus | "";

  const db = await getDb();
  const col = db.collection<CustomerDoc>("customers");

  const filter: Record<string, unknown> = {};
  if (keyword) {
    filter.$or = [
      { name: { $regex: keyword, $options: "i" } },
      { email: { $regex: keyword, $options: "i" } },
      { phone: { $regex: keyword, $options: "i" } },
    ];
  }
  if (statusQ) {
    filter.status = statusQ;
  }

  const [total, list] = await Promise.all([
    col.countDocuments(filter),
    col
      .find(filter, { sort: { updatedAt: -1 } })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .map((c) => ({
        id: (c._id as ObjectId).toHexString(),
        name: c.name,
        email: c.email,
        phone: c.phone,
        remark: c.remark,
        status: c.status,
        expireAt: c.expireAt ?? null,
        linkedUserId: c.linkedUserId ?? null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }))
      .toArray(),
  ]);

  return NextResponse.json({ total, page, pageSize, list });
}

/**
 * POST /api/admin/customers
 * 创建客户
 */
export async function POST(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  let body: {
    name?: string;
    email?: string;
    phone?: string;
    remark?: string;
    status?: CustomerStatus;
    trialDays?: number;
    expireAt?: string | null;
    linkedUserId?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "客户名称必填" }, { status: 400 });
  }
  const status: CustomerStatus =
    body.status === "disabled" ||
    body.status === "expired" ||
    body.status === "trial" ||
    body.status === "active"
      ? body.status
      : typeof body.trialDays === "number"
        ? "trial"
        : "active";

  // 计算到期时间
  let expireAt: Date | null = null;
  if (typeof body.expireAt === "string" && body.expireAt) {
    expireAt = new Date(body.expireAt);
  } else if (typeof body.trialDays === "number" && body.trialDays > 0) {
    const d = new Date();
    d.setDate(d.getDate() + body.trialDays);
    expireAt = d;
  }

  const now = new Date();
  const doc: CustomerDoc = {
    name,
    email: body.email?.trim() || undefined,
    phone: body.phone?.trim() || undefined,
    remark: body.remark?.trim() || undefined,
    status,
    expireAt,
    linkedUserId: body.linkedUserId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const db = await getDb();
  const r = await db.collection<CustomerDoc>("customers").insertOne(doc);
  return NextResponse.json({
    ok: true,
    id: r.insertedId.toHexString(),
  });
}
