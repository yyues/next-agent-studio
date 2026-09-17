"use client";

import { Fragment, memo, type FC } from "react";
import { useTranslations } from "next-intl";
import type { TextMessagePartProps } from "@assistant-ui/react";
import { useCommandRegistry } from "@/lib/command-registry";
import { parseSlashSegments } from "@/lib/slash-directive";
import { CommandChip } from "@/components/assistant-ui/command-chip";

/**
 * 用户消息文本渲染:将 "/命令" 渲染为特殊 chip(技能/MCP 双样式),
 * 未知的 /词(路径、除号等)回退纯文本。供 UserMessage 的
 * MessagePrimitive.Parts components.Text 使用(props 为扁平的 part 字段)。
 *
 * 粘连回退:命令名字符集含中文,选中 chip 后直接打中文(无空格分隔)会把
 * 后续文字吞进命令名导致匹配失败;此时尝试"最长已知前缀"拆分,
 * 命令渲染为 chip、剩余部分回纯文本。
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
        let entry = knownNames.has(seg.id) ? byName(seg.label) : undefined;
        let rest = "";
        if (!entry) {
          for (let len = seg.label.length - 1; len > 0; len--) {
            const prefix = seg.label.slice(0, len);
            if (knownNames.has(prefix.toLowerCase())) {
              entry = byName(prefix);
              rest = seg.label.slice(len);
              break;
            }
          }
        }
        if (!entry) return <span key={i}>/{seg.label}</span>;
        return (
          <Fragment key={i}>
            <CommandChip
              type={entry.type}
              label={entry.name}
              variant="history"
              aria-label={t("slashChipHint")}
            />
            {rest && <span>{rest}</span>}
          </Fragment>
        );
      })}
    </p>
  );
};

export const UserMessageText = memo(UserMessageTextImpl);
