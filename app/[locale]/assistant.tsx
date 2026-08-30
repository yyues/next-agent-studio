"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Thread } from "@/components/assistant-ui/thread";
import { getClientRuntimeContext } from "@/lib/client-runtime-context";
import type { FC } from "react";

type AssistantProps = {
  /** 当前会话唯一 id，透传给 /api/chat 用于服务端会话维度 */
  conversationId: string;
  /** 当前角色 id（来自 URL），缺省回退到运行时上下文 */
  roleId?: string;
};

/**
 * 对话运行时。会话由父组件按 conversationId remount（key 变化），
 * 每次对话拿到全新线程，切换角色/新建对话不会复用上一个会话。
 */
export const Assistant: FC<AssistantProps> = ({ conversationId, roleId }) => {
  const runtime = useChatRuntime({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport: new AssistantChatTransport({
      api: "/api/chat",
      body: () => {
        const context = getClientRuntimeContext();
        return {
          userId: context.userId,
          roleId: roleId ?? context.roleId,
          conversationId,
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
};
