"use client";

import { type FC } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { SettingsIcon } from "lucide-react";
import { RoleSwitcher } from "@/components/assistant-ui/role-switcher";

type SettingsMenuProps = {
  /** 切换角色后的回调(由对话页同步 URL 查询参数;当前会话继续使用新角色) */
  onRoleSwitch?: (roleId: string) => void;
};

/**
 * 左上角设置区:内联角色切换器(显示+切换) + 齿轮一键直达设置页。
 * 设置页内用标签切换模块并记住上次访问的标签,这里无需二级菜单。
 */
export const SettingsMenu: FC<SettingsMenuProps> = ({ onRoleSwitch }) => {
  const router = useRouter();
  const t = useTranslations("roles");

  return (
    <div className="flex items-center gap-1.5">
      {/* 当前角色展示 + 切换(内联 Select) */}
      <RoleSwitcher onRoleSwitch={onRoleSwitch} />

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
