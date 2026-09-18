"use client";

import { create } from "zustand";
import { getClientRuntimeContext } from "@/lib/client-runtime-context";

/**
 * 角色列表的客户端共享缓存(zustand,模式参照 lib/command-registry)。
 *
 * 角色列表极少变化:设置页/聊天页/切换器共用一份数据,
 * 组件挂载(含 remount)时 ensureRoles 命中缓存零网络请求;
 * CRUD 后由写接口的响应直接驱动更新(applyRoleXxx),
 * 跨标签页通过 localStorage storage 事件触发对端强制刷新。
 */

export type RoleSummary = {
  roleId: string;
  displayName: string;
  description?: string;
  enabled: boolean;
  /** 排序与展示用;新建/更新后按它重排保持与列表接口一致的顺序 */
  priority: number;
  /** 新会话开场建议(ThreadSuggestions 直接从缓存读,不再调详情端点) */
  suggestions: string[];
};

const ROLES_CACHE_VERSION_KEY = "roles-cache-version";

type RolesState = {
  roles: RoleSummary[];
  /** 列表接口返回的 DB 侧当前角色(仅首访无本地上下文时用于兜底同步) */
  serverCurrentRoleId: string | null;
  fetchedAt: number | null;
  loading: boolean;
  /** 最近一次回源是否失败(消费方据此展示错误提示) */
  loadFailed: boolean;
  /** 有缓存直接返回(零请求);force 或无缓存时回源 */
  ensureRoles: (opts?: { force?: boolean }) => Promise<void>;
  applyRoleCreated: (role: RoleSummary) => void;
  applyRoleUpdated: (role: RoleSummary) => void;
  applyRoleDeleted: (roleId: string) => void;
};

function sortByPriority(roles: RoleSummary[]) {
  return [...roles].sort((a, b) => a.priority - b.priority);
}

/** 写操作后通知其他标签页(storage 事件只在对端标签页触发) */
function notifyOtherTabs() {
  try {
    window.localStorage.setItem(
      ROLES_CACHE_VERSION_KEY,
      String(Date.now()),
    );
  } catch {
    // localStorage 不可用(隐私模式等)时退化为单标签页语义
  }
}

async function fetchRoles(): Promise<{
  currentRoleId: string;
  roles: RoleSummary[];
} | null> {
  try {
    const userId = getClientRuntimeContext().userId;
    const res = await fetch(
      `/api/settings/roles?userId=${encodeURIComponent(userId)}`,
    );
    if (!res.ok) return null;
    return (await res.json()) as {
      currentRoleId: string;
      roles: RoleSummary[];
    };
  } catch {
    return null;
  }
}

export const useRolesStore = create<RolesState>((set, get) => ({
  roles: [],
  serverCurrentRoleId: null,
  fetchedAt: null,
  loading: false,
  loadFailed: false,

  ensureRoles: async (opts) => {
    const { fetchedAt, loading } = get();
    if (loading) return;
    if (fetchedAt !== null && !opts?.force) return;

    set({ loading: true });
    const data = await fetchRoles();
    if (data) {
      set({
        roles: sortByPriority(data.roles ?? []),
        serverCurrentRoleId: data.currentRoleId ?? null,
        fetchedAt: Date.now(),
        loading: false,
        loadFailed: false,
      });
    } else {
      set({ loading: false, loadFailed: true });
    }
  },

  applyRoleCreated: (role) => {
    set((s) => ({ roles: sortByPriority([...s.roles, role]) }));
    notifyOtherTabs();
  },

  applyRoleUpdated: (role) => {
    set((s) => ({
      roles: sortByPriority(
        s.roles.map((r) => (r.roleId === role.roleId ? role : r)),
      ),
    }));
    notifyOtherTabs();
  },

  applyRoleDeleted: (roleId) => {
    set((s) => ({ roles: s.roles.filter((r) => r.roleId !== roleId) }));
    notifyOtherTabs();
  },
}));

if (typeof window !== "undefined") {
  // 其他标签页的 CRUD 通过 storage 事件广播版本号变化,本标签页强制刷新
  window.addEventListener("storage", (e) => {
    if (e.key === ROLES_CACHE_VERSION_KEY) {
      void useRolesStore.getState().ensureRoles({ force: true });
    }
  });
}
