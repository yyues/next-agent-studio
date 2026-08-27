"use client";

import { forwardRef } from "react";
import type { ChatMessage } from "@/lib/api";
import { renderContent } from "@/lib/render";

interface Props {
  messages: ChatMessage[];
  sending: boolean;
  // 空状态类型
  emptyState: "guest-empty" | "no-conversation" | "no-messages";
  hasProvider: boolean;
}

// 消息列表渲染区，forwardRef 让父组件控制滚动
export const MessageList = forwardRef<HTMLDivElement, Props>(function MessageList(
  { messages, sending, emptyState, hasProvider },
  ref,
) {
  let placeholder: React.ReactNode = null;
  if (emptyState === "guest-empty") {
    placeholder = (
      <div className="h-full flex items-center justify-center text-neutral-400">
        输入消息开始对话{!hasProvider ? "（需先在「API 设置」填写配置）" : ""}
      </div>
    );
  } else if (emptyState === "no-conversation") {
    placeholder = (
      <div className="h-full flex items-center justify-center text-neutral-400">
        点击「新对话」开始聊天
      </div>
    );
  } else if (emptyState === "no-messages") {
    placeholder = (
      <div className="h-full flex items-center justify-center text-neutral-400">
        输入消息开始对话
      </div>
    );
  }

  return (
    <div ref={ref} className="flex-1 overflow-y-auto">
      {messages.length === 0 ? (
        placeholder
      ) : (
        <div className="max-w-3xl mx-auto py-6 px-4 space-y-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed ${
                  m.role === "user"
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-100 text-neutral-900"
                }`}
              >
                {renderContent(m.content) || (
                  <span className="text-neutral-400 italic">
                    {sending && i === messages.length - 1 ? "思考中…" : ""}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
