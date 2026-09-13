"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/ai-sdk";
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
    ...(initialMessages && initialMessages.length > 0 ? { initialMessages } : {}),
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
