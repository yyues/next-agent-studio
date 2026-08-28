"use client";

import type { Conversation, UserInfo } from "@/lib/api";
import { BotIcon } from "lucide-react";

interface Props {
  user: UserInfo;
  conversations: Conversation[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onLogout: () => void;
}

export function ConversationSidebar({
  user,
  conversations,
  activeId,
  loading,
  onSelect,
  onNew,
  onDelete,
  onLogout,
}: Props) {
  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-neutral-200 bg-neutral-100 px-3">
      {/* Logo 区 — 参考 antdx */}
      <div className="flex items-center justify-start px-6 py-6 gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-neutral-900 text-white">
          <BotIcon className="size-4" />
        </div>
        <span className="text-base font-bold text-neutral-900">Agent Demo</span>
      </div>

      {/* 新对话按钮 */}
      <div className="px-3 pb-3">
        <button
          onClick={onNew}
          className="w-full rounded-lg bg-neutral-900 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
        >
          + 新对话
        </button>
      </div>

      {/* 会话列表 — 参考 antdx conversations style */}
      <div className="mt-3 flex-1 overflow-y-auto py-1">
        {loading ? (
          <p className="px-3 py-2 text-sm text-neutral-400">加载中…</p>
        ) : conversations.length === 0 ? (
          <p className="px-3 py-2 text-sm text-neutral-400">暂无会话</p>
        ) : (
          <ul className="flex flex-col gap-0.5 px-2">
            {conversations.map((c) => (
              <li key={c.id}>
                <div
                  className={`group flex items-center gap-1 rounded-md px-2 py-2 cursor-pointer text-sm transition-colors hover:bg-neutral-200 ${
                    activeId === c.id ? "bg-white font-medium shadow-sm" : ""
                  }`}
                  onClick={() => onSelect(c.id)}
                >
                  <span className="flex-1 truncate text-neutral-800">{c.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(c.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-600 px-1"
                    title="删除"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 底部 Footer — 参考 antdx sideFooter */}
      <div className="h-10 my-2 flex items-center justify-between gap-2 border-t border-neutral-300/80 pt-3 px-1">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate text-neutral-800">{user.name}</p>
          <p className="text-xs text-neutral-500 truncate">{user.email}</p>
        </div>
        <button
          onClick={onLogout}
          className="text-xs text-neutral-500 hover:text-neutral-900 px-2 py-1 rounded border border-neutral-300 hover:border-neutral-400"
        >
          退出
        </button>
      </div>
    </aside>
  );
}