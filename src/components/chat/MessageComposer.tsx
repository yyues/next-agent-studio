"use client";

import { ComposerPrimitive, useAuiState } from "@assistant-ui/react";
import { SendIcon, Square, PaperclipIcon, MicIcon } from "lucide-react";
import { ComposerAttachmentItem } from "@/components/assistant-ui/attachment";
import type { CSSProperties } from "react";
import { clsx } from "clsx";

interface MessageComposerProps {
  placeholder?: string;
  /** 空消息页布局：agentName 居中显示，输入框居中 */
  startPage?: boolean;
}

/**
 * 消息输入组件
 * 参考 @ant-design/x Sender 样式
 * - 默认圆角胶囊 (24px radius)
 * - 空页 startPage：宽度更大，居中显示
 * - 支持附件、语音、发送/停止互斥
 */
export function MessageComposer({ placeholder, startPage }: MessageComposerProps) {
  const isRunning = useAuiState((s) => s.thread.isRunning);

  return (
    <div className={clsx("p-1", !startPage && "w-full", startPage && "w-full max-w-[760px]")}>
      <ComposerPrimitive.Root
        className={clsx(
          "mx-auto flex w-full flex-col gap-2 border border-neutral-200 bg-white p-3 transition-colors focus-within:border-neutral-400",
          startPage
            ? "rounded-[20px] shadow-[0_8px_32px_-12px_rgba(0,0,0,0.08)]"
            : "rounded-[24px]",
        )}
        style={{ ["--composer-radius" as string]: "1.5rem" } as unknown as CSSProperties}
      >
        {/* 附件区域（待发送） */}
        <ComposerPrimitive.Attachments>
          {({ attachment }) => <ComposerAttachmentItem attachment={attachment} />}
        </ComposerPrimitive.Attachments>

        {/* 输入区域 */}
        <div className="flex items-end gap-1 px-1">
          {/* 附件按钮 */}
          <ComposerPrimitive.AddAttachment
            multiple
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50"
          >
            <PaperclipIcon className="size-[18px]" />
          </ComposerPrimitive.AddAttachment>

          {/* 输入框 */}
          <ComposerPrimitive.Input
            className={clsx(
              "flex-1 resize-none bg-transparent px-3 py-2 text-[15px] leading-relaxed text-neutral-900 placeholder:text-neutral-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
              startPage && "text-base",
            )}
            placeholder={placeholder}
            autoFocus
            submitMode="enter"
          />

          {/* 语音输入 */}
          <ComposerPrimitive.Dictate className="flex size-9 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50">
            <MicIcon className="size-[18px]" />
          </ComposerPrimitive.Dictate>

          {/* 发送/停止按钮 — 参考 antdx actionNode 圆按钮 */}
          {isRunning ? (
            <ComposerPrimitive.Cancel className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white transition-colors hover:bg-neutral-700">
              <Square className="size-4" />
            </ComposerPrimitive.Cancel>
          ) : (
            <ComposerPrimitive.Send className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white transition-colors hover:bg-neutral-700 disabled:opacity-50">
              <SendIcon className="size-4" />
            </ComposerPrimitive.Send>
          )}
        </div>
      </ComposerPrimitive.Root>

      {/* 底部 hint — 空页时不显示，避免重复 */}
      {!startPage && (
        <p className="mx-auto mt-2 text-center text-xs text-neutral-400">
          Enter 发送，Shift+Enter 换行
        </p>
      )}
    </div>
  );
}
