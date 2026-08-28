"use client";

import { type FC, useEffect } from "react";
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

  useEffect(() => {
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
  }, []);

  const cycle = () => {
    const idx = themeOrder.indexOf(theme);
    const next = themeOrder[(idx + 1) % themeOrder.length];
    setTheme(next);
  };

  const Icon = themeIcons[theme];

  return (
    <Tooltip>
      <TooltipTrigger
        onClick={cycle}
        className="text-muted-foreground hover:text-foreground hover:bg-muted-foreground/15 dark:hover:bg-muted-foreground/30 inline-flex size-7 items-center justify-center rounded-full transition-colors"
        aria-label={t(theme)}
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipContent side="bottom">{t(theme)}</TooltipContent>
    </Tooltip>
  );
};
