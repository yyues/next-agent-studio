"use client";

import { useState, type FC } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { LogOutIcon } from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { useAuthStore } from "@/lib/auth-store";
import { useRolesStore } from "@/lib/roles-store";

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
      // 客户端路由无整页刷新,内存缓存必须显式清空:
      // 否则管理员退出换普通账号登录后,isAdmin/角色列表残留
      useAuthStore.getState().reset();
      useRolesStore.getState().reset();
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
