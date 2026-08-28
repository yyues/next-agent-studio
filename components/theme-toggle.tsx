"use client";

import { type FC, useEffect, useState } from "react";
import { SunIcon, MoonIcon, MonitorIcon } from "lucide-react";
import { useThemeStore, type Theme } from "@/lib/theme-store";
import { useTranslations } from "next-intl";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const themeOrder: Theme[] = ["light", "dark", "system"];
const themeIcons: Record<Theme, FC<{ className?: string }>> = {
  light: SunIcon,
  dark: MoonIcon,
  system: MonitorIcon,
};

export const ThemeToggle: FC = () => {
  const { theme, setTheme } = useThemeStore();
  const t = useTranslations("theme");
  // mounted 状态用于避免 SSR hydration 不匹配：
  // server 渲染 "system" 图标，client 可能从 localStorage 读到 "dark"
  // 通过 mounted 标记，在 client 挂载后才显示真实主题
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // 从 localStorage 同步主题
    const stored = localStorage.getItem("theme");
    if (
      stored === "light" ||
      stored === "dark" ||
      stored === "system"
    ) {
      if (stored !== useThemeStore.getState().theme) {
        useThemeStore.getState().setTheme(stored);
      }
    }
    setMounted(true);
  }, []);

  const cycle = () => {
    const idx = themeOrder.indexOf(theme);
    const next = themeOrder[(idx + 1) % themeOrder.length];
    setTheme(next);
  };

  // SSR 和首次渲染始终显示 system 图标，避免 hydration 不匹配
  const displayTheme = mounted ? theme : "system";
  const Icon = themeIcons[displayTheme];

  return (
    <Tooltip>
      <TooltipTrigger
        onClick={cycle}
        className="text-muted-foreground hover:text-foreground hover:bg-muted-foreground/15 dark:hover:bg-muted-foreground/30 inline-flex size-7 items-center justify-center rounded-full transition-colors"
        aria-label={t(displayTheme)}
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipContent side="bottom">{t(displayTheme)}</TooltipContent>
    </Tooltip>
  );
};
