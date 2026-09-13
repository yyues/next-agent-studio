/**
 * GET    /api/conversations/[conversationId] — 取会话全量消息(无记录返回空)
 * PUT    /api/conversations/[conversationId] — 保存全量消息(body: userId/roleId/messages)
 * PATCH  /api/conversations/[conversationId] — 重命名(body: userId/title)
 * DELETE /api/conversations/[conversationId] — 删除
 */
import { NextResponse } from "next/server";
import { connectToMongo } from "@/lib/mongodb";
import { ConversationModel } from "@/lib/models/conversation";
import { getAuthUserId } from "@/lib/auth-request";

async function getUserId(req: Request) {
  const url = new URL(req.url);
  return getAuthUserId(
      req,
      url.searchParams.get("userId") ?? req.headers.get("x-user-id"),
    );
}

/** PUT/PATCH 的 userId 允许放在 body(前端保存时随 JSON 提交) */
async function getUserIdWithBody(req: Request, bodyUserId?: unknown) {
  const url = new URL(req.url);
  return getAuthUserId(
    req,
    url.searchParams.get("userId") ??
      req.headers.get("x-user-id") ??
      (typeof bodyUserId === "string" ? bodyUserId : undefined),
  );
}

/** 首条用户消息截断生成默认标题 */
function deriveTitle(messages: { role: string; parts?: { type: string; text?: string }[] }[]) {
  for (const msg of messages) {
    if (msg.role !== "user") continue;
    const text = (msg.parts ?? [])
      .filter((p) => p.type === "text")
      .map((p) => p.text ?? "")
      .join(" ")
      .trim();
    if (text) return text.slice(0, 30);
  }
  return "";
}

type Params = { params: Promise<{ conversationId: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const { conversationId } = await params;
    const userId = await getUserId(req);
    await connectToMongo();
    const doc = await ConversationModel.findOne({
      userId,
      conversationId,
    }).lean();
    if (!doc) return NextResponse.json({ messages: [], title: "" });
    return NextResponse.json({
      messages: doc.messages ?? [],
      title: doc.title ?? "",
      roleId: doc.roleId,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load conversation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const { conversationId } = await params;
    const body = (await req.json()) as {
      roleId?: string;
      userId?: string;
      messages?: { role: string; parts?: { type: string; text?: string }[] }[];
    };
    if (!Array.isArray(body.messages)) {
      return NextResponse.json({ error: "messages array required." }, { status: 400 });
    }
    const userId = await getUserIdWithBody(req, body.userId);

    await connectToMongo();
    const existing = await ConversationModel.findOne({
      userId,
      conversationId,
    }).lean();
    // 已有自定义标题(重命名过)则保留,否则按首条用户消息生成
    const title =
      existing?.title || deriveTitle(body.messages);

    await ConversationModel.findOneAndUpdate(
      { userId, conversationId },
      {
        userId,
        conversationId,
        roleId: body.roleId ?? existing?.roleId ?? "general",
        title,
        messages: body.messages,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return NextResponse.json({ saved: true, title });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save conversation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { conversationId } = await params;
    const body = (await req.json()) as { title?: string; userId?: string };
    const userId = await getUserIdWithBody(req, body.userId);
    const title = body.title?.trim();
    if (!title) {
      return NextResponse.json({ error: "title required." }, { status: 400 });
    }
    await connectToMongo();
    const doc = await ConversationModel.findOneAndUpdate(
      { userId, conversationId },
      { title: title.slice(0, 60) },
      { new: true },
    ).lean();
    if (!doc) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }
    return NextResponse.json({ title: doc.title });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to rename conversation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const { conversationId } = await params;
    const userId = await getUserId(req);
    await connectToMongo();
    const result = await ConversationModel.deleteOne({
      userId,
      conversationId,
    });
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete conversation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
