/**
 * POST   /api/feedback — 提交/更新消息反馈(同一条消息覆盖旧值)
 * DELETE /api/feedback?userId=&conversationId=&messageId= — 清除反馈
 */
import { NextResponse } from "next/server";
import { connectToMongo } from "@/lib/mongodb";
import { MessageFeedbackModel } from "@/lib/models/message-feedback";
import { getAuthUserId } from "@/lib/auth-request";

type FeedbackBody = {
  userId?: string;
  conversationId?: string;
  messageId?: string;
  roleId?: string;
  type?: "positive" | "negative";
  snapshot?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as FeedbackBody;
    const { conversationId, messageId, type, roleId, snapshot } = body;
    if (!conversationId || !messageId || !type) {
      return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    }
    const userId = await getAuthUserId(req, body.userId);

    await connectToMongo();
    await MessageFeedbackModel.updateOne(
      { userId, conversationId, messageId },
      {
        $set: {
          userId,
          conversationId,
          messageId,
          roleId: roleId ?? "general",
          type,
          snapshot: snapshot ?? "",
        },
      },
      { upsert: true },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save feedback.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = await getAuthUserId(
      req,
      url.searchParams.get("userId") ?? req.headers.get("x-user-id"),
    );
    const conversationId = url.searchParams.get("conversationId");
    const messageId = url.searchParams.get("messageId");
    if (!conversationId || !messageId) {
      return NextResponse.json({ error: "MISSING_FIELDS" }, { status: 400 });
    }

    await connectToMongo();
    await MessageFeedbackModel.deleteOne({
      userId,
      conversationId,
      messageId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to clear feedback.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
