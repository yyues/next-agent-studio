"use client";

import { Fragment, memo, type FC } from "react";
import { useTranslations } from "next-intl";
import type { TextMessagePartProps } from "@assistant-ui/react";
import { useCommandRegistry, type CommandEntry } from "@/lib/command-registry";
import { parseDirectiveSegments } from "@/lib/slash-directive";
import { CommandChip } from "@/components/assistant-ui/command-chip";

/**
 * 用户消息文本渲染:将 "/命令" 与 "@提及" 渲染为特殊 chip(技能/MCP 双样式),
 * 未知的 /词、@词(路径、除号、邮箱等)回退纯文本。供 UserMessage 的
 * MessagePrimitive.Parts components.Text 使用(props 为扁平的 part 字段)。
 *
 * 粘连回退:名称字符集含中文,选中 chip 后直接打中文(无空格分隔)会把
 * 后续文字吞进名称导致匹配失败;此时尝试"最长已知前缀"拆分,
 * 命令渲染为 chip、剩余部分回纯文本。@提及 仅匹配 MCP server。
 */
const UserMessageTextImpl: FC<TextMessagePartProps> = ({ text }) => {
  const knownNames = useCommandRegistry((s) => s.knownNames);
  const byName = useCommandRegistry((s) => s.byName);
  const t = useTranslations("thread");
  const segments = parseDirectiveSegments(text);

  /** @ 仅认 MCP；/ 仅认技能，避免未挂载 MCP 被斜杠误导为可调用 */
  const allowedKinds = (segType: string): CommandEntry["type"][] =>
    segType === "mention" ? ["mcp"] : ["skill"];

  const resolveEntry = (segType: string, label: string) => {
    const kinds = allowedKinds(segType);
    let entry = knownNames.has(label.toLowerCase()) ? byName(label) : undefined;
    if (entry && !kinds.includes(entry.type)) entry = undefined;
    let rest = "";
    if (!entry) {
      for (let len = label.length - 1; len > 0; len--) {
        const prefix = label.slice(0, len);
        if (!knownNames.has(prefix.toLowerCase())) continue;
        const candidate = byName(prefix);
        if (!candidate) continue;
        if (!kinds.includes(candidate.type)) continue;
        entry = candidate;
        rest = label.slice(len);
        break;
      }
    }
    return { entry, rest };
  };

  return (
    <p className="whitespace-pre-line">
      {segments.map((seg, i) => {
        if (seg.kind === "text") return <span key={i}>{seg.text}</span>;
        const trigger = seg.type === "mention" ? "@" : "/";
        const { entry, rest } = resolveEntry(seg.type, seg.label);
        if (!entry)
          return (
            <span key={i}>
              {trigger}
              {seg.label}
            </span>
          );
        return (
          <Fragment key={i}>
            <CommandChip
              type={seg.type === "mention" ? "mention" : entry.type}
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
