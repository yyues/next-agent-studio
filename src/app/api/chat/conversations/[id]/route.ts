import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import type { ConversationDoc, MessageDoc } from "@/types/db";
import { ObjectId } from "mongodb";

type Params = { params: Promise<{ id: string }> };

// 获取单个会话 + 其全部消息
export async function GET(_request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "会话 ID 无效" }, { status: 400 });
  }
  const db = await getDb();
  const conv = await db.collection<ConversationDoc>("conversations").findOne({
    _id: new ObjectId(id),
    userId: user._id,
  });
  if (!conv) {
    return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  }
  const messages = await db
    .collection<MessageDoc>("messages")
    .find({ conversationId: id })
    .sort({ createdAt: 1 })
    .toArray();
  return NextResponse.json({
    conversation: {
      id: conv._id.toString(),
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    },
    messages: messages.map((m) => ({
      id: m._id?.toString(),
      role: m.role,
      content: m.content,
    })),
  });
}

// 删除会话及其消息
export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "会话 ID 无效" }, { status: 400 });
  }
  const db = await getDb();
  await db.collection<ConversationDoc>("conversations").deleteOne({
    _id: new ObjectId(id),
    userId: user._id,
  });
  await db.collection<MessageDoc>("messages").deleteMany({ conversationId: id });
  return NextResponse.json({ ok: true });
}
