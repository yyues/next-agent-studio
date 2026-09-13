"use client";

import { memo, type FC } from "react";
import { useTranslations } from "next-intl";
import type { TextMessagePartProps } from "@assistant-ui/react";
import { useCommandRegistry } from "@/lib/command-registry";
import { parseSlashSegments } from "@/lib/slash-directive";
import { CommandChip } from "@/components/assistant-ui/command-chip";

/**
 * 用户消息文本渲染:将 "/命令" 渲染为特殊 chip(技能/MCP 双样式),
 * 未知的 /词(路径、除号等)回退纯文本。供 UserMessage 的
 * MessagePrimitive.Parts components.Text 使用(props 为扁平的 part 字段)。
 */
const UserMessageTextImpl: FC<TextMessagePartProps> = ({ text }) => {
  const knownNames = useCommandRegistry((s) => s.knownNames);
  const byName = useCommandRegistry((s) => s.byName);
  const t = useTranslations("thread");
  const segments = parseSlashSegments(text);

  return (
    <p className="whitespace-pre-line">
      {segments.map((seg, i) => {
        if (seg.kind === "text") return <span key={i}>{seg.text}</span>;
        const entry = knownNames.has(seg.id) ? byName(seg.label) : undefined;
        if (!entry) return <span key={i}>/{seg.label}</span>;
        return (
          <CommandChip
            key={i}
            type={entry.type}
            label={entry.name}
            variant="history"
            aria-label={t("slashChipHint")}
          />
        );
      })}
    </p>
  );
};

export const UserMessageText = memo(UserMessageTextImpl);
