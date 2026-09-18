"use client";

import { create } from "zustand";

/**
 * 当前登录用户信息(来源 GET /api/me)。
 * 前端据 isAdmin 显示管理入口、角色详情只读态等;
 * 懒加载一次,全 app 共享;登出/切换账号时 reset(见 logout-button),
 * 避免上一账号的 isAdmin 残留到下一个账号。
 */
type AuthState = {
  userId: string;
  isAdmin: boolean;
  /** null=尚未加载完成 */
  loading: boolean;
  /** 本次页面会话是否已完成一次拉取;reset 后允许重新拉取 */
  loaded: boolean;
  ensureLoaded: () => void;
  reset: () => void;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  userId: "demo-user",
  isAdmin: false,
  loading: false,
  loaded: false,
  ensureLoaded: () => {
    const { loading, loaded } = get();
    if (loading || loaded) return;

    set({ loading: true });
    void fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { userId?: string; isAdmin?: boolean } | null) => {
        if (d) {
          set({
            userId: d.userId ?? "demo-user",
            isAdmin: Boolean(d.isAdmin),
          });
        }
      })
      .catch(() => undefined)
      .finally(() => set({ loading: false, loaded: true }));
  },
  reset: () =>
    set({
      userId: "demo-user",
      isAdmin: false,
      loading: false,
      loaded: false,
    }),
}));
