import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import type { ConversationDoc } from "@/types/db";
import { ObjectId } from "mongodb";

// 列出当前用户的会话
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const db = await getDb();
  const list = await db
    .collection<ConversationDoc>("conversations")
    .find({ userId: user._id })
    .sort({ updatedAt: -1 })
    .toArray();
  return NextResponse.json({
    conversations: list.map((c) => ({
      id: c._id.toString(),
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
  });
}

// 新建会话
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  let body: { title?: string } = {};
  try {
    body = await request.json();
  } catch {
    // 允许空 body
  }
  const db = await getDb();
  const now = new Date();
  const insert = await db.collection<ConversationDoc>("conversations").insertOne({
    _id: new ObjectId(),
    userId: user._id,
    title: body.title?.trim() || "新对话",
    createdAt: now,
    updatedAt: now,
  });
  return NextResponse.json({
    conversation: {
      id: insert.insertedId.toString(),
      title: body.title?.trim() || "新对话",
      createdAt: now,
      updatedAt: now,
    },
  });
}
