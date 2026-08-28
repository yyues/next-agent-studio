"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/ai-sdk";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Thread } from "@/components/assistant-ui/thread";
import { getClientRuntimeContext } from "@/lib/client-runtime-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { RoleSwitcher } from "@/components/role-switcher";

export const Assistant = () => {
  const runtime = useChatRuntime({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    transport: new AssistantChatTransport({
      api: "/api/chat",
      body: () => {
        const context = getClientRuntimeContext();
        return {
          userId: context.userId,
          roleId: context.roleId,
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
      <div className="relative h-dvh">
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
          <ThemeToggle />
        </div>
        <div className="h-dvh flex flex-col">
          <RoleSwitcher />
          <div className="flex-1 min-h-0">
            <Thread />
          </div>
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
};
