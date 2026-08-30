"use client";

import { useEffect, useRef, useState, type FC } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { CpuIcon, SettingsIcon, UserIcon } from "lucide-react";
import { RoleSwitcher } from "@/components/assistant-ui/role-switcher";

type SettingsMenuProps = {
  /** 切换角色后的回调（由对话页触发新建会话） */
  onRoleSwitch?: (roleId: string) => void;
};

/**
 * 左上角设置区：内联角色切换器（显示+切换） + 齿轮（icon-only）弹出菜单。
 * 菜单含「角色管理」「Provider 管理」：前者跳转 /admin/roles 页面，
 * 后者跳转 /settings/provider 页面。
 */
export const SettingsMenu: FC<SettingsMenuProps> = ({ onRoleSwitch }) => {
  const router = useRouter();
  const t = useTranslations("roles");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭弹层
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const openRoleMgmt = () => {
    setMenuOpen(false);
    router.push("/admin/roles");
  };
  const openProvider = () => {
    setMenuOpen(false);
    router.push("/settings/provider");
  };

  return (
    <div className="flex items-center gap-1.5">
      {/* 当前角色展示 + 切换（内联 Select） */}
      <RoleSwitcher onRoleSwitch={onRoleSwitch} />

      {/* 设置（icon-only） */}
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="text-muted-foreground hover:text-foreground hover:bg-muted-foreground/15 size-7 rounded-full p-1.5 transition-colors"
          aria-label={t("title")}
          aria-expanded={menuOpen}
        >
          <SettingsIcon className="size-3.5" />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="bg-popover text-popover-foreground border-border shadow-lg absolute left-0 top-full z-50 mt-1 min-w-40 rounded-lg border p-1"
          >
            <button
              type="button"
              role="menuitem"
              onClick={openRoleMgmt}
              className="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm"
            >
              <UserIcon className="size-4" />
              {t("title")}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={openProvider}
              className="hover:bg-accent hover:text-accent-foreground flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm"
            >
              <CpuIcon className="size-4" />
              Provider 管理
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
