/**
 * GET /api/conversations?userId= — 当前用户会话列表(不含 messages)
 */
import { NextResponse } from "next/server";
import { connectToMongo } from "@/lib/mongodb";
import { ConversationModel } from "@/lib/models/conversation";
import { normalizeUserId } from "@/lib/server-settings";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = normalizeUserId(
      url.searchParams.get("userId") ?? req.headers.get("x-user-id"),
    );
    await connectToMongo();
    const docs = await ConversationModel.find({ userId })
      .select("conversationId roleId title updatedAt -_id")
      .sort({ updatedAt: -1 })
      .lean();
    return NextResponse.json({ conversations: docs });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list conversations.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
