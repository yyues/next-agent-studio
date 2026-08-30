"use client";

import { useCallback, useEffect, useState, type FC } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { getClientRuntimeContext, setClientRuntimeContext } from "@/lib/client-runtime-context";
import { SettingsIcon, ShieldCheckIcon, UserIcon, ChevronDownIcon } from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";

type RoleItem = {
  roleId: string;
  displayName: string;
  enabled: boolean;
};

const builtinRoleIds = new Set(["general", "developer", "analyst"]);

type RoleSwitcherProps = {
  /** 切换角色后的回调（由对话页触发新建会话） */
  onRoleSwitch?: (roleId: string) => void;
};

export const RoleSwitcher: FC<RoleSwitcherProps> = ({ onRoleSwitch }) => {
  const t = useTranslations("roles");
  const pathname = usePathname();
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [currentRoleId, setCurrentRoleId] = useState("general");
  const [loading, setLoading] = useState(true);

  const loadRoles = useCallback(async () => {
    try {
      const ctx = getClientRuntimeContext();
      const res = await fetch(
        `/api/settings/roles?userId=${encodeURIComponent(ctx.userId)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        currentRoleId: string;
        roles: RoleItem[];
      };
      setRoles(data.roles.filter((r) => r.enabled));
      setCurrentRoleId(data.currentRoleId);
      setClientRuntimeContext({ roleId: data.currentRoleId });
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  const handleSwitch = async (roleId: string) => {
    const ctx = getClientRuntimeContext();
    setCurrentRoleId(roleId);
    setClientRuntimeContext({ roleId });
    try {
      await fetch("/api/settings/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: ctx.userId, roleId }),
      });
    } catch {
      // silently ignore
    }
    // 通知对话页新建会话（切换角色不复用旧会话）
    onRoleSwitch?.(roleId);
  };

  if (loading || roles.length === 0) return null;

  const currentRole = roles.find((r) => r.roleId === currentRoleId);

  return (
    <div className="border-border/40 bg-card/50 flex items-center gap-2 border-b px-4 py-2">
      <div className="relative">
        <select
          value={currentRoleId}
          onChange={(e) => handleSwitch(e.target.value)}
          className="text-foreground h-7 appearance-none rounded-md border-0 bg-transparent pr-6 pl-1.5 text-sm font-medium outline-none focus:ring-0"
        >
          {roles.map((role) => (
            <option key={role.roleId} value={role.roleId}>
              {role.displayName}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="text-muted-foreground pointer-events-none absolute top-1/2 right-1 size-3.5 -translate-y-1/2" />
      </div>

      <TooltipIconButton
        tooltip={t("title")}
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-foreground hover:bg-muted-foreground/15 size-7 rounded-full"
        onClick={() => window.location.assign("/admin/roles")}
      >
        <SettingsIcon className="size-3.5" />
      </TooltipIconButton>
    </div>
  );
};
