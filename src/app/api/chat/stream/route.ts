import { NextRequest } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import {
  createAgent,
  restoreMessages,
  resolveProviderConfigForUser,
  type ProviderConfig,
} from "@/lib/agent";
import type { ConversationDoc, MessageDoc } from "@/types/db";
import { ObjectId } from "mongodb";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SSE 事件编码
function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  // 鉴权：登录用户可用；未登录时若开启游客模式也可用
  const user = await getCurrentUser();
  const allowGuest = process.env.ALLOW_GUEST_CHAT === "true";
  if (!user && !allowGuest) {
    return new Response(JSON.stringify({ error: "未登录，请先登录" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  let body: {
    conversationId?: string;
    message?: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "请求体格式错误" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const userText = body.message?.trim();
  if (!userText) {
    return new Response(JSON.stringify({ error: "缺少 message" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // 解析 provider 配置（请求体临时 > DB 用户 > env 默认）
  let providerConfig: ProviderConfig;
  try {
    providerConfig = await resolveProviderConfigForUser(user?._id, body);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "配置错误" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  // 持久化相关：仅登录用户 + 有效 conversationId 时进行
  const conversationId = body.conversationId;
  const isPersisted =
    !!user && !!conversationId && ObjectId.isValid(conversationId);

  let conv: ConversationDoc | null = null;
  const db = user ? await getDb() : null;

  if (isPersisted && db) {
    conv = await db.collection<ConversationDoc>("conversations").findOne({
      _id: new ObjectId(conversationId!),
      userId: user!._id,
    });
    if (!conv) {
      return new Response(JSON.stringify({ error: "会话不存在" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
  }

  // 拉取历史消息恢复上下文（仅持久化会话）
  let history: AgentMessage[] = [];
  if (isPersisted && db) {
    const historyDocs = await db
      .collection<MessageDoc>("messages")
      .find({ conversationId: conversationId! })
      .sort({ createdAt: 1 })
      .toArray();
    history = restoreMessages(historyDocs);
  }

  // 持久化本次用户消息
  if (isPersisted && db && conv) {
    const now = new Date();
    await db.collection<MessageDoc>("messages").insertOne({
      conversationId: conversationId!,
      userId: user!._id,
      role: "user",
      content: userText,
      createdAt: now,
    });
    // 首条消息自动用作会话标题
    if (history.length === 0 && conv.title === "新对话") {
      const title = userText.length > 30 ? userText.slice(0, 30) + "…" : userText;
      await db.collection<ConversationDoc>("conversations").updateOne(
        { _id: conv._id },
        { $set: { title, updatedAt: now } },
      );
    }
  }

  const userMessage: AgentMessage = { role: "user", content: userText } as AgentMessage;
  const agent = createAgent(history.concat([userMessage]), providerConfig);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let assistantText = "";

      const unsubscribe = agent.subscribe((event) => {
        try {
          if (event.type === "message_update") {
            const ame = event.assistantMessageEvent;
            if (ame && ame.type === "text_delta") {
              assistantText += ame.delta;
              controller.enqueue(encoder.encode(sse("delta", { delta: ame.delta })));
            }
          } else if (event.type === "agent_end") {
            controller.enqueue(encoder.encode(sse("done", { content: assistantText })));
          }
        } catch {
          // controller 可能已关闭
        }
      });

      try {
        await agent.prompt(userText);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "生成失败";
        controller.enqueue(encoder.encode(sse("error", { error: msg })));
      } finally {
        unsubscribe();
        // 持久化 assistant 消息（仅持久化会话）
        if (isPersisted && db && conv && assistantText) {
          await db.collection<MessageDoc>("messages").insertOne({
            conversationId: conversationId!,
            userId: user!._id,
            role: "assistant",
            content: assistantText,
            createdAt: new Date(),
          });
          await db.collection<ConversationDoc>("conversations").updateOne(
            { _id: conv._id },
            { $set: { updatedAt: new Date() } },
          );
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
