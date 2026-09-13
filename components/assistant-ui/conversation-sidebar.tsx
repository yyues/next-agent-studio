"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FC,
} from "react";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { getClientRuntimeContext } from "@/lib/client-runtime-context";
import { CONVERSATION_SAVED_EVENT } from "@/lib/conversation-events";
import {
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  CheckIcon,
  XIcon,
  MessageSquareIcon,
  BotIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ConversationItem = {
  conversationId: string;
  roleId: string;
  title: string;
  updatedAt?: string;
};

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

/**
 * 会话列表侧边栏:
 * - 新对话按钮 / 会话切换(路由跳转) / 行内重命名 / 删除(confirm)
 * - 监听 conversation-saved 事件与窗口 focus 刷新列表
 * - 桌面端由父组件控制折叠;移动端以抽屉形式渲染(open 受控)
 */
export const ConversationSidebar: FC<{
  collapsed?: boolean;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  appTitle?: string;
}> = ({
  collapsed = false,
  mobileOpen = false,
  onCloseMobile,
  appTitle = "Agent Studio",
}) => {
  const t = useTranslations("thread");
  const router = useRouter();
  const params = useParams<{ chatId: string }>();
  const currentChatId = params?.chatId;

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingTarget, setDeletingTarget] = useState<ConversationItem | null>(
    null,
  );

  const loadList = useCallback(async () => {
    try {
      const userId = getClientRuntimeContext().userId;
      const res = await fetch(
        `/api/conversations?userId=${encodeURIComponent(userId)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { conversations: ConversationItem[] };
      setConversations(data.conversations ?? []);
    } catch {
      // 列表加载失败保持现状
    }
  }, []);

  useEffect(() => {
    void loadList();
    const onSaved = () => void loadList();
    window.addEventListener(CONVERSATION_SAVED_EVENT, onSaved);
    return () =>
      window.removeEventListener(CONVERSATION_SAVED_EVENT, onSaved);
  }, [loadList]);

  const startNewChat = () => {
    onCloseMobile?.();
    router.push(`/chat/${crypto.randomUUID()}`);
  };

  const switchTo = (id: string) => {
    if (id === currentChatId) {
      onCloseMobile?.();
      return;
    }
    onCloseMobile?.();
    router.push(`/chat/${id}`);
  };

  const submitRename = async (item: ConversationItem) => {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title || title === item.title) return;
    try {
      const userId = getClientRuntimeContext().userId;
      await fetch(`/api/conversations/${encodeURIComponent(item.conversationId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, title }),
      });
      await loadList();
    } catch {
      // 重命名失败静默
    }
  };

  const confirmDelete = async () => {
    if (!deletingTarget) return;
    const target = deletingTarget;
    setDeletingTarget(null);
    try {
      const userId = getClientRuntimeContext().userId;
      await fetch(
        `/api/conversations/${encodeURIComponent(target.conversationId)}?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );
      await loadList();
      // 删除的是当前会话 → 跳到新对话
      if (target.conversationId === currentChatId) {
        router.push(`/chat/${crypto.randomUUID()}`);
      }
    } catch {
      // 删除失败静默
    }
  };

  if (collapsed) return null;

  const list = (
    <>
      {/* 品牌区:系统 icon + 标题 */}
      <div className="mb-3 flex items-center gap-2 px-1 py-1">
        <span className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-lg">
          <BotIcon className="size-4" />
        </span>
        <span className="truncate text-sm font-semibold tracking-tight">
          {appTitle}
        </span>
      </div>

      <button
        type="button"
        onClick={startNewChat}
        className="flex w-full items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm transition-colors hover:bg-muted"
      >
        <PlusIcon className="size-4" />
        {t("newChat")}
      </button>

      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {conversations.length === 0 ? (
          <p className="text-muted-foreground px-2 py-4 text-xs">
            {t("noThreads")}
          </p>
        ) : (
          conversations.map((item) => {
            const active = item.conversationId === currentChatId;
            const renaming = renamingId === item.conversationId;
            return (
              <div
                key={item.conversationId}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted text-foreground/90",
                )}
              >
                {renaming ? (
                  <>
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void submitRename(item);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="bg-background h-7 min-w-0 flex-1 rounded border px-1.5 text-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void submitRename(item)}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <CheckIcon className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingId(null)}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => switchTo(item.conversationId)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      title={item.title || item.conversationId}
                    >
                      <MessageSquareIcon className="size-3.5 shrink-0 opacity-60" />
                      <span className="truncate">
                        {item.title || t("untitledThread")}
                      </span>
                    </button>
                    <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingId(item.conversationId);
                          setRenameValue(item.title);
                        }}
                        className="text-muted-foreground hover:text-foreground"
                        title={t("renameThread")}
                      >
                        <PencilIcon className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingTarget(item)}
                        className="text-muted-foreground hover:text-destructive"
                        title={t("deleteThread")}
                      >
                        <Trash2Icon className="size-3" />
                      </button>
                    </span>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );

  return (
    <>
      {/* 桌面侧边栏 */}
      <aside className="bg-card/50 hidden h-full w-60 shrink-0 flex-col border-r border-border/60 p-3 md:flex">
        {list}
      </aside>

      {/* 移动端抽屉 */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="bg-black/40 absolute inset-0"
            onClick={onCloseMobile}
          />
          <aside className="bg-card absolute inset-y-0 left-0 flex w-72 flex-col p-3 shadow-xl">
            {list}
          </aside>
        </div>
      )}

      {/* 删除确认 */}
      {deletingTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="bg-black/40 absolute inset-0"
            onClick={() => setDeletingTarget(null)}
          />
          <div className="bg-card relative z-10 w-80 rounded-lg border border-border/60 p-4 shadow-lg">
            <p className="text-sm">
              {t("deleteThreadConfirm", {
                name: deletingTarget.title || deletingTarget.conversationId,
              })}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingTarget(null)}
                className="hover:bg-muted rounded-md px-3 py-1.5 text-sm"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md px-3 py-1.5 text-sm"
              >
                {t("deleteThread")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/** 侧边栏折叠状态(localStorage 持久化) */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(
      window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1",
    );
  }, []);
  const toggle = useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }, []);
  return { collapsed, toggle };
}
