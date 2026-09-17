"use client";

import { useCallback, useEffect, useState, type FC } from "react";
import { Select, SelectItem } from "@/components/ui/select";
import {
  RUNTIME_CONTEXT_UPDATED_EVENT,
  getClientRuntimeContext,
  setClientRuntimeContext,
} from "@/lib/client-runtime-context";

type RoleItem = {
  roleId: string;
  displayName: string;
  enabled: boolean;
};

type RoleSwitcherProps = {
  /** 切换角色后的回调(由对话页同步 URL 查询参数;当前会话继续,后续消息使用新角色) */
  onRoleSwitch?: (roleId: string) => void;
};

/**
 * 左上角内联角色切换器:用 shadcn Select(原生)显示当前角色并切换。
 * 切换角色 → 当前会话继续,后续消息即用新角色(上下文实时读取)。
 * 监听 runtime-context 更新事件,切回历史会话恢复其角色时同步选中项。
 */
export const RoleSwitcher: FC<RoleSwitcherProps> = ({ onRoleSwitch }) => {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [currentRoleId, setCurrentRoleId] = useState("general");
  const [loading, setLoading] = useState(true);

  const loadRoles = useCallback(async (opts?: { syncFromDb?: boolean }) => {
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
      // 仅"全新环境"(本地从未存过上下文)才用 DB 的 currentRoleId 兜底;
      // 常态下 localStorage/URL 才是事实源,回写 DB 值会与切换竞态导致选中项回跳
      if (
        opts?.syncFromDb &&
        data.currentRoleId &&
        data.currentRoleId !== getClientRuntimeContext().roleId
      ) {
        setClientRuntimeContext({ roleId: data.currentRoleId });
        setCurrentRoleId(data.currentRoleId);
      } else {
        setCurrentRoleId(getClientRuntimeContext().roleId);
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 挂载时拉列表;syncFromDb 仅在本地无上下文(首次访问)时用 DB 兜底
    const firstVisit = !window.localStorage.getItem("assistant-runtime-context");
    void loadRoles({ syncFromDb: firstVisit });
    // 角色切换不改变角色列表,事件只同步选中项——不重拉列表,
    // 避免与切换时未提交的 PUT 竞态把选中项回写为 DB 旧值
    const onUpdate = () =>
      setCurrentRoleId(getClientRuntimeContext().roleId);
    window.addEventListener(RUNTIME_CONTEXT_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(RUNTIME_CONTEXT_UPDATED_EVENT, onUpdate);
  }, [loadRoles]);

  const handleSwitch = (roleId: string) => {
    if (roleId === currentRoleId) return;
    const ctx = getClientRuntimeContext();
    setCurrentRoleId(roleId);
    setClientRuntimeContext({ roleId });
    // 持久化默认角色不阻塞切换(上下文才是会话内事实源),失败静默
    void fetch("/api/settings/roles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: ctx.userId, roleId }),
    }).catch(() => undefined);
    // 通知对话页同步 URL 查询参数(当前会话继续,不新建)
    onRoleSwitch?.(roleId);
  };

  if (loading || roles.length === 0) {
    return <span className="text-muted-foreground px-2 text-xs">—</span>;
  }

  return (
    <Select
      value={currentRoleId}
      onValueChange={handleSwitch}
      className="border-border/40 bg-card/50 text-foreground h-7 max-w-[160px] cursor-pointer rounded-full border px-3 text-xs font-medium outline-none focus:ring-0"
    >
      {roles.map((role) => (
        <SelectItem key={role.roleId} value={role.roleId}>
          {role.displayName}
        </SelectItem>
      ))}
    </Select>
  );
};
