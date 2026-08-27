"use client";

import type { Conversation, UserInfo } from "@/lib/api";

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
    <aside className="w-64 shrink-0 border-r border-neutral-200 flex flex-col bg-neutral-50">
      <div className="p-3 border-b border-neutral-200">
        <button
          onClick={onNew}
          className="w-full rounded-lg bg-neutral-900 text-white py-2 text-sm font-medium hover:bg-neutral-800"
        >
          + 新对话
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="p-3 text-sm text-neutral-400">加载中…</p>
        ) : conversations.length === 0 ? (
          <p className="p-3 text-sm text-neutral-400">暂无会话</p>
        ) : (
          <ul>
            {conversations.map((c) => (
              <li key={c.id}>
                <div
                  className={`group flex items-center gap-1 px-3 py-2 cursor-pointer text-sm hover:bg-neutral-200/60 ${
                    activeId === c.id ? "bg-neutral-200/80 font-medium" : ""
                  }`}
                  onClick={() => onSelect(c.id)}
                >
                  <span className="flex-1 truncate">{c.title}</span>
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
      <div className="p-3 border-t border-neutral-200 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{user.name}</p>
          <p className="text-xs text-neutral-400 truncate">{user.email}</p>
        </div>
        <button
          onClick={onLogout}
          className="text-xs text-neutral-500 hover:text-neutral-900 px-2 py-1 rounded border border-neutral-300"
        >
          退出
        </button>
      </div>
    </aside>
  );
}
