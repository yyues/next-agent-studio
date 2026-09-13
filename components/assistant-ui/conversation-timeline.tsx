"use client";

import { useState, type FC } from "react";
import { useTranslations } from "next-intl";
import { useAuiState } from "@assistant-ui/react";
import { cn } from "@/lib/utils";

type TimelineMessage = {
  id: string;
  role: string;
  preview: string;
  createdAt?: string | number | Date;
};

/** 从消息 content/parts 中提取纯文本预览(两种格式都兼容) */
function previewOf(m: {
  content?: readonly { type: string; text?: string }[];
  parts?: readonly { type: string; text?: string }[];
}): string {
  const parts = m.content ?? m.parts ?? [];
  return parts
    .filter((p) => p?.type === "text")
    .map((p) => p?.text ?? "")
    .join(" ")
    .trim();
}

function formatTime(createdAt?: string | number | Date): string {
  if (!createdAt) return "";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 对话历史缩略时间线(minimap):
 * 线程区左侧窄条,每根横线代表一条消息——等长横线仅以颜色区分
 * (用户消息主色/AI 消息弱化色)。悬停(或键盘聚焦)显示消息预览卡片,
 * 点击平滑滚动定位到原消息。仅在大屏展示,避免挤压内容。
 */
export const ConversationTimeline: FC = () => {
  const t = useTranslations("thread");
  const messages = useAuiState((s) => s.thread.messages);
  const [active, setActive] = useState<number | null>(null);

  const items: TimelineMessage[] = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: m.id,
      role: m.role,
      preview: previewOf(m),
      createdAt: (m as { createdAt?: string | number | Date }).createdAt,
    }));

  if (items.length === 0) return null;

  const scrollTo = (id: string) => {
    document
      .getElementById(`aui-msg-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // 长对话自适应间距,避免超出可视高度
  const gapClass =
    items.length > 60
      ? "gap-[1px]"
      : items.length > 30
        ? "gap-[2px]"
        : "gap-[3px]";

  return (
    <div
      aria-label={t("timelineLabel")}
      className={cn(
        // overflow-y:clip 仅裁纵轴(防超长对话溢出),横轴不裁剪——
        // 否则悬停预览卡(向右展开)会被裁成一条竖线
        "absolute inset-y-0 left-0 z-10 hidden max-h-full flex-col justify-center px-3 lg:flex [overflow-y:clip]",
        gapClass,
      )}
    >
      {items.map((m, i) => {
        const isActive = active === i;
        return (
          <div key={m.id} className="relative">
            <button
              type="button"
              onClick={() => scrollTo(m.id)}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              aria-label={`${m.role === "user" ? t("timelineYou") : t("timelineAi")}: ${m.preview.slice(0, 60) || t("timelineEmpty")}`}
              className="group flex h-[14px] w-12 cursor-pointer items-center outline-none"
            >
              <span
                className={cn(
                  "h-0.5 w-[6px] rounded-full transition-colors duration-150 motion-reduce:transition-none",
                  m.role === "user"
                    ? "bg-primary/60 group-hover:bg-primary group-focus-visible:bg-primary"
                    : "bg-muted-foreground/25 group-hover:bg-muted-foreground/60 group-focus-visible:bg-muted-foreground/60",
                )}
              />
            </button>

            {/* 悬停预览卡片:角色 + 时间 + 文本摘要 */}
            {isActive && (
              <div
                role="tooltip"
                className="bg-popover text-popover-foreground aui-anim-item border-border pointer-events-none absolute left-full top-1/2 z-30 ml-1.5 w-56 -translate-y-1/2 rounded-lg border p-2.5 shadow-md"
              >
                <div className="flex items-center gap-1.5 text-[11px] font-medium">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      m.role === "user" ? "bg-primary" : "bg-muted-foreground/60",
                    )}
                  />
                  {m.role === "user" ? t("timelineYou") : t("timelineAi")}
                  {m.createdAt && (
                    <span className="text-muted-foreground ml-auto font-normal">
                      {formatTime(m.createdAt)}
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed break-all">
                  {m.preview || t("timelineEmpty")}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
