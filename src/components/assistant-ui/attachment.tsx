"use client";

import { AttachmentPrimitive } from "@assistant-ui/react";
import { XIcon, FileIcon, ImageIcon } from "lucide-react";

/**
 * Composer 中的附件项（可删除，带缩略图/文件名/删除按钮）
 */
export function ComposerAttachmentItem({ attachment }: { attachment: { type: string } }) {
  const isImage = attachment.type === "image";
  return (
    <AttachmentPrimitive.Root className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white p-2 shadow-sm">
      <AttachmentPrimitive.unstable_Thumb className="flex size-10 items-center justify-center rounded bg-neutral-100 font-mono text-xs text-neutral-600">
        {isImage ? (
          <ImageIcon className="size-4 text-green-500" />
        ) : (
          <FileIcon className="size-4 text-blue-500" />
        )}
      </AttachmentPrimitive.unstable_Thumb>
      <span className="min-w-0 flex-1 truncate text-sm">
        <AttachmentPrimitive.Name />
      </span>
      <AttachmentPrimitive.Remove className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600">
        <XIcon className="size-3" />
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
}

/**
 * 消息中的附件项（只读）
 */
export function MessageAttachmentItem({ attachment }: { attachment: { type: string } }) {
  const isImage = attachment.type === "image";
  return (
    <AttachmentPrimitive.Root className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2 shadow-sm">
      <AttachmentPrimitive.unstable_Thumb className="flex size-10 items-center justify-center rounded bg-neutral-100 font-mono text-xs text-neutral-600">
        {isImage ? (
          <ImageIcon className="size-4 text-green-500" />
        ) : (
          <FileIcon className="size-4 text-blue-500" />
        )}
      </AttachmentPrimitive.unstable_Thumb>
      <span className="min-w-0 flex-1 truncate text-sm">
        <AttachmentPrimitive.Name />
      </span>
    </AttachmentPrimitive.Root>
  );
}
