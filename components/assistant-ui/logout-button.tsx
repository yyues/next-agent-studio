"use client";

import { useState, type FC } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { LogOutIcon } from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";

/** 顶栏退出登录:清除认证 cookie 后回到登录页 */
export const LogoutButton: FC = () => {
  const t = useTranslations("login");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/login", { method: "DELETE" });
      router.replace("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <TooltipIconButton
      tooltip={t("logout")}
      side="bottom"
      type="button"
      variant="ghost"
      size="icon"
      aria-label={t("logout")}
      onClick={() => void logout()}
      disabled={busy}
      className="text-muted-foreground hover:text-foreground hover:bg-muted-foreground/15 size-7 rounded-full transition-colors"
    >
      <LogOutIcon className="size-4" />
    </TooltipIconButton>
  );
};
