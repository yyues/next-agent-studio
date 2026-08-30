"use client";

import { useEffect, useState, type FC } from "react";
import { SparklesIcon } from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { cn } from "@/lib/utils";
import {
  RUNTIME_CONTEXT_UPDATED_EVENT,
  getClientRuntimeContext,
  setClientRuntimeContext,
} from "@/lib/client-runtime-context";

/**
 * 深度思考开关。状态存于 client-runtime-context（localStorage 持久化），
 * transport body 会读取并随请求发送给 /api/chat。
 * 启用时常驻动效（慢速旋转 + 主色高亮）。
 */
export const DeepThinkingToggle: FC = () => {
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(getClientRuntimeContext().deepThinking === true);
    const onUpdate = () =>
      setActive(getClientRuntimeContext().deepThinking === true);
    window.addEventListener(RUNTIME_CONTEXT_UPDATED_EVENT, onUpdate);
    return () =>
      window.removeEventListener(RUNTIME_CONTEXT_UPDATED_EVENT, onUpdate);
  }, []);

  const toggle = () => {
    const next = !active;
    setActive(next);
    setClientRuntimeContext({ deepThinking: next });
  };

  return (
    <TooltipIconButton
      tooltip={active ? "关闭深度思考" : "深度思考"}
      side="bottom"
      type="button"
      variant="ghost"
      size="icon"
      aria-pressed={active}
      aria-label="深度思考"
      onClick={toggle}
      className={cn(
        "size-7 rounded-full transition-colors",
        active
          ? "text-primary ring-1 ring-primary/40 bg-primary/10 hover:bg-primary/15"
          : "text-muted-foreground hover:text-foreground hover:bg-muted-foreground/15",
      )}
    >
      <SparklesIcon
        className={cn(
          "size-4",
          active && "animate-spin [animation-duration:3s]",
        )}
      />
    </TooltipIconButton>
  );
};
