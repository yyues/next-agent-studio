"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/ai-sdk";
import {
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
} from "@assistant-ui/react";
import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";
import { Thread } from "@/components/assistant-ui/thread";
import { getClientRuntimeContext } from "@/lib/client-runtime-context";
import { CONVERSATION_SAVED_EVENT } from "@/lib/conversation-events";
import type { FC } from "react";

type AssistantProps = {
  /** 当前会话唯一 id,透传给 /api/chat 并作为持久化主键 */
  conversationId: string;
  /** 当前角色 id(来自 URL),缺省回退到运行时上下文 */
  roleId?: string;
  /** 历史消息(服务端加载),作为 runtime 初始消息 */
  initialMessages?: UIMessage[];
};

/**
 * 对话运行时。会话由父组件按 conversationId remount(key 变化),
 * 每次对话拿到全新线程,切换角色/新建对话不会复用上一个会话。
 * 持久化:每轮 assistant 完成后 onFinish 携带全量 messages,PUT 到
 * /api/conversations(保存失败静默,不打断对话)。
 */
export const Assistant: FC<AssistantProps> = ({
  conversationId,
  roleId,
  initialMessages,
}) => {
  const runtime = useChatRuntime({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    // 官方附件适配器:图片转 data URL(视觉输入),文本包成标签注入;
    // 不配置时默认接受全部类型,多数模型会报错(官方文档警告)
    adapters: {
      attachments: new CompositeAttachmentAdapter([
        new SimpleImageAttachmentAdapter(),
        new SimpleTextAttachmentAdapter(),
      ]),
    },
    // AI SDK v5+ ChatInit 的初始消息键是 messages(v4 才叫 initialMessages,
    // 传错键名会被静默忽略,导致会话历史不渲染)
    ...(initialMessages && initialMessages.length > 0
      ? { messages: initialMessages }
      : {}),
    onFinish: ({ messages }: { messages: UIMessage[] }) => {
      if (messages.length === 0) return;
      const context = getClientRuntimeContext();
      void fetch(`/api/conversations/${encodeURIComponent(conversationId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: context.userId,
          roleId: roleId ?? context.roleId,
          messages,
        }),
      })
        .then((res) => {
          if (res.ok) {
            window.dispatchEvent(new CustomEvent(CONVERSATION_SAVED_EVENT));
          }
        })
        .catch(() => undefined);
    },
    transport: new AssistantChatTransport({
      api: "/api/chat",
      body: () => {
        const context = getClientRuntimeContext();
        return {
          userId: context.userId,
          roleId: roleId ?? context.roleId,
          conversationId,
          deepThinking: context.deepThinking === true,
          mcpServerIds: context.mcpServerIds,
        };
      },
      headers: () => {
        const context = getClientRuntimeContext();
        return {
          "x-user-id": context.userId,
        };
      },
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}
