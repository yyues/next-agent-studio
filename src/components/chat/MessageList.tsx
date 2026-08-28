"use client";

import {
  ThreadPrimitive,
  MessagePrimitive,
  MessagePartPrimitive,
  ActionBarPrimitive,
  useAuiState,
  type ThreadMessage,
} from "@assistant-ui/react";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { MessageAttachmentItem } from "@/components/assistant-ui/attachment";
import { UserIcon, BotIcon, CopyIcon, RotateCwIcon } from "lucide-react";
import { clsx } from "clsx";

/**
 * 消息列表组件 — 参考 antdx Bubble.List 样式
 * - 最大宽度 940px（外层由 ChatLayoutInner 控制）
 * - assistant 流式生成时底部显示渐变色更新条
 */
export function MessageList() {
  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto">
        <ThreadPrimitive.Empty>
          <ThreadEmptyState />
        </ThreadPrimitive.Empty>

        <div className="mb-6">
          <ThreadPrimitive.Messages>
            {({ message }) => (
              <MessageRenderer message={message} />
            )}
          </ThreadPrimitive.Messages>
        </div>

        <ThreadPrimitive.ViewportFooter className="flex justify-center py-2">
          <ThreadPrimitive.ScrollToBottom />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

/** 空状态组件 */
function ThreadEmptyState() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center text-neutral-400">
        <div className="mb-3 text-4xl">💬</div>
        <p className="text-sm">输入消息开始对话</p>
      </div>
    </div>
  );
}

/**
 * 消息渲染器 — 参考 antdx Bubble 样式
 * - assistant: start 左对齐
 * - user: end 右对齐
 * - streaming 更新状态：底部彩色渐变条 (ant-bubble-content-updating)
 */
function MessageRenderer({ message }: { message: ThreadMessage }) {
  const isUser = message.role === "user";
  const isError =
    message.status?.type === "incomplete" && message.status?.reason === "error";
  const isUpdating = message.status?.type === "running";
  const isRunning = useAuiState((s) => s.thread.isRunning);

  return (
    <MessagePrimitive.Root className="group/message flex w-full gap-3 px-2 py-2.5">
      {/* 头像 — assistant 左侧，user 不需要头像 */}
      {!isUser && (
        <div className="flex shrink-0 flex-col items-center pt-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white border border-neutral-200 shadow-sm text-neutral-700">
            <BotIcon className="size-4" />
          </div>
        </div>
      )}

      {/* 消息内容 */}
      <div
        className={clsx(
          "flex min-w-0 flex-1 flex-col",
          isUser ? "items-end" : "items-start",
        )}
      >
        <div
          className={clsx(
            "relative max-w-full rounded-2xl px-4 py-2.5",
            // user: antdx end 样式 — 纯色无阴影（右对齐）
            isUser &&
              "bg-neutral-900 text-white rounded-br-sm",
            // assistant: antdx start 样式 — 白卡+阴影（左对齐）
            !isUser &&
              !isError &&
              "bg-white text-neutral-900 rounded-bl-sm shadow-sm border border-neutral-100",
            // 错误
            isError && "ring-1 ring-red-300 bg-red-50 text-red-700",
            // 流式更新时底部彩色渐变条 (ant-bubble-content-updating)
            isUpdating &&
              !isUser &&
              "ant-bubble-content-updating",
          )}
        >
          <MessagePrimitive.Parts
            components={{
              Text: isUser ? UserTextPart : MarkdownText,
            }}
          />

          {/* 消息附件（只读） */}
          <MessagePrimitive.Attachments>
            {({ attachment }) => (
              <div className="mt-2">
                <MessageAttachmentItem attachment={attachment} />
              </div>
            )}
          </MessagePrimitive.Attachments>

          {/* 错误提示 */}
          {isError && (
            <div className="mt-2 text-xs text-red-500">生成失败，请重试</div>
          )}
        </div>

        {/* Assistant 消息操作栏 — 参考 antdx Footer（仅完成态显示） */}
        {!isUser && !isRunning && (
          <ActionBarPrimitive.Root
            className="mt-1.5 flex items-center gap-1 text-neutral-400"
          >
            <ActionBarPrimitive.Copy className="flex size-6 items-center justify-center rounded hover:bg-neutral-100 hover:text-neutral-600">
              <CopyIcon className="size-3.5" />
            </ActionBarPrimitive.Copy>
            <ActionBarPrimitive.Reload className="flex size-6 items-center justify-center rounded hover:bg-neutral-100 hover:text-neutral-600">
              <RotateCwIcon className="size-3.5" />
            </ActionBarPrimitive.Reload>
          </ActionBarPrimitive.Root>
        )}
      </div>

      {/* user 消息头像（右对齐） */}
      {isUser && (
        <div className="flex shrink-0 flex-col items-center pt-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-white shadow-sm">
            <UserIcon className="size-4" />
          </div>
        </div>
      )}
    </MessagePrimitive.Root>
  );
}

/** 用户消息文本 - 保持简单纯文本 */
function UserTextPart() {
  return (
    <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
      <MessagePartPrimitive.Text />
    </p>
  );
}