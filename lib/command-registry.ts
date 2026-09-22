"use client";

import { create } from "zustand";
import { getClientRuntimeContext } from "@/lib/client-runtime-context";

/**
 * "/" 命令注册表(客户端):
 * 汇总当前角色的技能与 MCP 服务器,供
 * - Composer 斜杠面板（技能与 MCP 服务器）
 * - Composer @ 面板（仅 MCP）
 * - 输入框镜像高亮 & 对话历史 chip(校验 /name 是否已知命令)
 * 共用。数据来自现有只读接口,roleId 变化时重新拉取。
 */

export type CommandEntry = {
  /** skill | mcp */
  type: "skill" | "mcp";
  /** 唯一键(skillId / serverId) */
  id: string;
  /** 命令名(输入 /name 时的 token) */
  name: string;
  /** 面板显示名 */
  label: string;
  description: string;
};

type CommandRegistryState = {
  roleId: string | null;
  loading: boolean;
  commands: CommandEntry[];
  /** 已知命令名集合(小写) */
  knownNames: Set<string>;
  byName: (name: string) => CommandEntry | undefined;
  ensureLoaded: (roleId: string) => void;
};

export const useCommandRegistry = create<CommandRegistryState>((set, get) => ({
  roleId: null,
  loading: false,
  commands: [],
  knownNames: new Set<string>(),
  byName: (name) => {
    const lower = name.toLowerCase();
    return get().commands.find(
      (c) => c.name.toLowerCase() === lower || c.id.toLowerCase() === lower,
    );
  },
  ensureLoaded: (roleId) => {
    const { roleId: loaded, loading } = get();
    if (loaded === roleId || loading) return;

    set({ loading: true });
    const userId = getClientRuntimeContext().userId;

    void (async () => {
      const [skillsRes, mcpRes] = await Promise.allSettled([
        fetch(`/api/settings/skills/${encodeURIComponent(roleId)}`),
        fetch(
          `/api/settings/roles/${encodeURIComponent(roleId)}/mcp?userId=${encodeURIComponent(userId)}`,
        ),
      ]);

      const commands: CommandEntry[] = [];
      if (skillsRes.status === "fulfilled" && skillsRes.value.ok) {
        const data = (await skillsRes.value.json()) as {
          skills?: {
            skillId: string;
            title: string;
            description?: string;
            enabled: boolean;
          }[];
        };
        for (const s of data.skills ?? []) {
          if (!s.enabled) continue;
          commands.push({
            type: "skill",
            id: s.skillId,
            name: s.skillId,
            label: s.title || s.skillId,
            description: s.description ?? "",
          });
        }
      }
      if (mcpRes.status === "fulfilled" && mcpRes.value.ok) {
        const data = (await mcpRes.value.json()) as {
          servers?: {
            serverId: string;
            name: string;
            url: string;
            type?: "http" | "stdio";
            command?: string;
            args?: string[];
            enabled: boolean;
          }[];
        };
        for (const s of data.servers ?? []) {
          if (!s.enabled) continue;
          commands.push({
            type: "mcp",
            id: s.serverId,
            name: s.name,
            label: s.name,
            description:
              s.type === "stdio" ? [s.command, ...(s.args ?? [])].filter(Boolean).join(" ") : s.url,
          });
        }
      }

      const knownNames = new Set(
        commands.map((c) => c.name.toLowerCase()).concat(commands.map((c) => c.id.toLowerCase())),
      );
      set({ roleId, loading: false, commands, knownNames });
    })();
  },
}));
