"use client";

import { useCallback, useEffect, useRef, useState, type FC } from "react";
import { PlugZapIcon } from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { cn } from "@/lib/utils";
import {
  RUNTIME_CONTEXT_UPDATED_EVENT,
  getClientRuntimeContext,
  setClientRuntimeContext,
} from "@/lib/client-runtime-context";

type McpServerItem = {
  serverId: string;
  name: string;
  url: string;
  enabled: boolean;
};

/**
 * 对话内 MCP 选择器:勾选本次对话启用哪些角色的 MCP server。
 * - 未勾选任何项时,后端使用角色下所有 enabled 的 server(角色默认)
 * - 勾选状态存 client-runtime-context(localStorage),transport 随请求发送
 * - 消息中可用 @server名称 强制指定(后端解析)
 * 角色未配置 MCP server 时整个按钮不显示。
 */
export const McpPicker: FC = () => {
  const [servers, setServers] = useState<McpServerItem[]>([]);
  const [selected, setSelected] = useState<string[] | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // 订阅上下文更新:对话内切换角色后重新加载新角色的 server 列表
  // (渲染期快照读 context 不会随切换重渲染)
  const [roleId, setRoleId] = useState(() => getClientRuntimeContext().roleId);

  const loadServers = useCallback(async (currentRoleId: string) => {
    try {
      const userId = getClientRuntimeContext().userId;
      const res = await fetch(
        `/api/settings/roles/${encodeURIComponent(currentRoleId)}/mcp?userId=${encodeURIComponent(userId)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { servers: McpServerItem[] };
      setServers(data.servers ?? []);
    } catch {
      setServers([]);
    }
  }, []);

  useEffect(() => {
    void loadServers(roleId);
  }, [roleId, loadServers]);

  useEffect(() => {
    const onUpdate = () => {
      const ctx = getClientRuntimeContext();
      setRoleId(ctx.roleId);
      setSelected(ctx.mcpServerIds);
    };
    window.addEventListener(RUNTIME_CONTEXT_UPDATED_EVENT, onUpdate);
    return () =>
      window.removeEventListener(RUNTIME_CONTEXT_UPDATED_EVENT, onUpdate);
  }, []);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (servers.length === 0) return null;

  const activeCount =
    selected === undefined
      ? servers.filter((s) => s.enabled).length
      : selected.length;

  const toggle = (serverId: string) => {
    const current =
      selected === undefined
        ? servers.filter((s) => s.enabled).map((s) => s.serverId)
        : [...selected];
    const next = current.includes(serverId)
      ? current.filter((id) => id !== serverId)
      : [...current, serverId];
    setSelected(next);
    setClientRuntimeContext({ mcpServerIds: next });
  };

  const resetToDefault = () => {
    setSelected(undefined);
    setClientRuntimeContext({ mcpServerIds: undefined });
  };

  return (
    <div ref={rootRef} className="relative">
      <TooltipIconButton
        tooltip={activeCount > 0 ? `MCP (${activeCount})` : "选择 MCP"}
        side="bottom"
        type="button"
        variant="ghost"
        size="icon"
        aria-label="选择 MCP server"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "size-7 rounded-full transition-colors",
          activeCount > 0
            ? "text-primary ring-1 ring-primary/40 bg-primary/10 hover:bg-primary/15"
            : "text-muted-foreground hover:text-foreground hover:bg-muted-foreground/15",
        )}
      >
        <PlugZapIcon className="size-4" />
      </TooltipIconButton>

      {open && (
        <div className="bg-popover text-popover-foreground border-border/60 absolute bottom-9 right-0 z-50 w-64 rounded-lg border p-2 shadow-md">
          <p className="text-muted-foreground px-2 py-1 text-xs">
            本次对话启用的 MCP(消息中可用 @名称 指定)
          </p>
          {servers.map((server) => {
            const checked =
              selected === undefined ? server.enabled : selected.includes(server.serverId);
            return (
              <label
                key={server.serverId}
                className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(server.serverId)}
                  className="size-3.5"
                />
                <span className="min-w-0 flex-1 truncate" title={server.url}>
                  {server.name}
                </span>
              </label>
            );
          })}
          {selected !== undefined && (
            <button
              type="button"
              onClick={resetToDefault}
              className="text-muted-foreground hover:text-foreground mt-1 w-full px-2 py-1 text-left text-xs"
            >
              恢复角色默认
            </button>
          )}
        </div>
      )}
    </div>
  );
};
