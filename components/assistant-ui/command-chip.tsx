"use client";

import type { FC } from "react";
import { PlugZapIcon, SparklesIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "/" 命令 chip:技能 与 MCP 两种类型。
 * - history 变体:用户气泡内,带边框+背景保证对比度,图标+配色双区分
 * - input 变体:输入框镜像层内,仅渲染高亮底色(文字由上层真实 textarea 显示)
 */
export const CommandChip: FC<{
  type: "skill" | "mcp";
  label: string;
  variant: "history" | "input";
  className?: string;
}> = ({ type, label, variant, className }) => {
  const isSkill = type === "skill";
  const Icon = isSkill ? SparklesIcon : PlugZapIcon;

  if (variant === "input") {
    return (
      <span
        className={cn(
          "rounded px-0.5",
          isSkill ? "bg-primary/25" : "bg-chart-2/30",
          className,
        )}
      >
        /{label}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "border bg-background/70 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[0.85em] font-medium backdrop-blur-sm",
        isSkill
          ? "border-primary/25 text-primary"
          : "border-chart-2/30 text-chart-2 dark:text-chart-2",
        className,
      )}
    >
      <Icon className="size-3 shrink-0" />/{label}
    </span>
  );
};
