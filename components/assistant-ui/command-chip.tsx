"use client";

import type { FC } from "react";
import { LightbulbIcon, PlugZapIcon, SparklesIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 命令 chip:技能(/)与 MCP(@提及)两种指令类型,另有开场建议(点击建议后
 * 填入输入框,发送时并入纯文本,不参与命令解析)。
 * - history 变体:用户气泡内/输入框 chip,带边框+背景保证对比度,图标+配色双区分
 * - input 变体:输入框镜像层内,仅渲染高亮底色(文字由上层真实 textarea 显示)
 * skill 与 mention(mcp)同用 teal/PlugZap 配色,仅前缀符区分(/ 与 @)。
 */
export const CommandChip: FC<{
  type: "skill" | "mcp" | "mention" | "suggestion";
  label: string;
  variant: "history" | "input";
  className?: string;
  "aria-label"?: string;
}> = ({ type, label, variant, className, ...rest }) => {
  const isSuggestion = type === "suggestion";
  const isSkill = type === "skill";
  const isMention = type === "mention" || type === "mcp";
  const prefix = isMention ? "@" : isSkill ? "/" : "";
  const Icon = isSuggestion
    ? LightbulbIcon
    : isSkill
      ? SparklesIcon
      : PlugZapIcon;

  if (variant === "input") {
    return (
      <span
        className={cn(
          "rounded px-0.5",
          isSuggestion
            ? "bg-violet-500/20"
            : isSkill
              ? "bg-primary/25"
              : "bg-chart-2/30",
          className,
        )}
      >
        {isSuggestion ? label : `${prefix}${label}`}
      </span>
    );
  }

  return (
    <span
      {...rest}
      className={cn(
        "border bg-background/70 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[0.85em] font-medium backdrop-blur-sm",
        isSuggestion
          ? "max-w-[18rem] border-violet-500/30 text-violet-600 dark:text-violet-400"
          : isSkill
            ? "border-primary/25 text-primary"
            : "border-chart-2/30 text-chart-2 dark:text-chart-2",
        className,
      )}
    >
      <Icon className="size-3 shrink-0" />
      {/* 指令 chip 显示 /名称 或 @名称;建议 chip 显示原文(可截断) */}
      {isSuggestion ? (
        <span className="truncate">{label}</span>
      ) : (
        `${prefix}${label}`
      )}
    </span>
  );
};
