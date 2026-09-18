"use client";

import { useEffect, type FC } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { SettingsIcon, ShieldCheckIcon } from "lucide-react";
import { RoleSwitcher } from "@/components/assistant-ui/role-switcher";
import { useAuthStore } from "@/lib/auth-store";

type SettingsMenuProps = {
  /** 切换角色后的回调(由对话页同步 URL 查询参数;当前会话继续使用新角色) */
  onRoleSwitch?: (roleId: string) => void;
};

/**
 * 左上角设置区:内联角色切换器(显示+切换) + 齿轮直达设置页
 * + 管理入口(仅管理员可见,直达 /admin 全局资源库维护页)。
 */
export const SettingsMenu: FC<SettingsMenuProps> = ({ onRoleSwitch }) => {
  const router = useRouter();
  const t = useTranslations("roles");
  const ta = useTranslations("admin");
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const ensureAuth = useAuthStore((s) => s.ensureLoaded);

  useEffect(() => {
    ensureAuth();
  }, [ensureAuth]);

  return (
    <div className="flex items-center gap-1.5">
      {/* 当前角色展示 + 切换(内联 Select) */}
      <RoleSwitcher onRoleSwitch={onRoleSwitch} />

      {/* 全局资源库维护(仅管理员) */}
      {isAdmin && (
        <button
          type="button"
          onClick={() => router.push("/admin")}
          className="text-primary/80 hover:text-primary hover:bg-primary/10 size-7 rounded-full p-1.5 transition-colors"
          aria-label={ta("managementEntry")}
          title={ta("managementEntry")}
        >
          <ShieldCheckIcon className="size-3.5" />
        </button>
      )}

      {/* 设置:一键直达 */}
      <button
        type="button"
        onClick={() => router.push("/settings")}
        className="text-muted-foreground hover:text-foreground hover:bg-muted-foreground/15 size-7 rounded-full p-1.5 transition-colors"
        aria-label={t("title")}
      >
        <SettingsIcon className="size-3.5" />
      </button>
    </div>
  );
};
