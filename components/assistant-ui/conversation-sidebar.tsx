"use client";

import {
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import {
  useCallback,
  useEffect,
  useState,
  type FC,
} from "react";
import { useTranslations } from "next-intl";
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

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

/** 单条会话:切换/行内重命名/删除,激活态由 Root 的 data-active 驱动 */
const ThreadListItem: FC<{
  onDelete: (id: string, title: string) => void;
}> = ({ onDelete }) => {
  const t = useTranslations("thread");
  const api = useAui();
  const itemId = useAuiState((s) => s.threadListItem.id);
  const title = useAuiState((s) => s.threadListItem.title);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  const submitRename = () => {
    setEditing(false);
    const next = value.trim();
    if (!next || next === title) return;
    const item = api.threads.item({ id: itemId });
    void item.rename(next);
  };

  return (
    <ThreadListItemPrimitive.Root
      className={cn(
        "aui-anim-item group relative flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors duration-200",
        "data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-medium hover:bg-muted text-foreground/90",
      )}
    >
      {/* 当前会话左侧指示条 */}
      <span className="bg-primary absolute start-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full opacity-0 group-data-[active=true]:opacity-100" />
      {editing ? (
        <>
          <input
            autoFocus
            value={value}
            autoComplete="off"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
              if (e.key === "Escape") setEditing(false);
            }}
            className="bg-background border-input h-7 min-w-0 flex-1 rounded border px-1.5 text-sm outline-none"
          />
          <button
            type="button"
            onClick={submitRename}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <CheckIcon className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <XIcon className="size-3.5" />
          </button>
        </>
      ) : (
        <>
          <ThreadListItemPrimitive.Trigger className="hover:group-hover/item:translate-x-0.5 flex min-w-0 flex-1 items-center gap-2 rounded-md py-0.5 text-left transition-transform duration-200 outline-none focus-visible:bg-muted/60 focus-visible:ring-primary/40 focus-visible:ring-1">
            <MessageSquareIcon className="size-3.5 shrink-0 opacity-60" />
            <span className="truncate" title={title ?? undefined}>
              {title || t("untitledThread")}
            </span>
          </ThreadListItemPrimitive.Trigger>
          <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
            <button
              type="button"
              onClick={() => {
                setValue(title ?? "");
                setEditing(true);
              }}
              className="text-muted-foreground hover:text-foreground mr-1"
              title={t("renameThread")}
            >
              <PencilIcon className="size-3" />
            </button>
            <ThreadListItemPrimitive.Delete
              className="text-muted-foreground hover:text-destructive"
              title={t("deleteThread")}
              onClick={(e) => {
                // preventDefault 阻断 primitive 内置的立即删除
                // (composeEventHandlers 会串联执行),删除统一走确认弹窗
                e.preventDefault();
                onDelete(itemId, title ?? "");
              }}
            >
              <Trash2Icon className="size-3" />
            </ThreadListItemPrimitive.Delete>
          </span>
        </>
      )}
    </ThreadListItemPrimitive.Root>
  );
};

/**
 * 会话列表侧边栏(ThreadListPrimitive 实现):
 * - 列表/切换/新建/重命名/删除全部走 assistant-ui 运行时(经 adapter 落到 /api/conversations)
 * - ↑/↓ 焦点导航与 Enter 切换由 ThreadListItemPrimitive.Root 内置(roving focus)
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
  const aui = useAui();

  const threadCount = useAuiState((s) => s.threads.threadIds.length);
  const [deletingTarget, setDeletingTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const confirmDelete = useCallback(() => {
    if (!deletingTarget) return;
    const { id } = deletingTarget;
    setDeletingTarget(null);
    try {
      void aui.threads.item({ id }).delete();
    } catch {
      // 线程已不在列表(被并发删除等),静默忽略
    }
  }, [deletingTarget, aui]);

  if (collapsed) return null;

  const list = (
    <>
      {/* 品牌区:渐变图标 + 流动渐变标题(静态垂直居中,不加漂浮动画) */}
      <div className="mb-3 flex items-center gap-2.5 px-1 py-1">
        <span className="from-primary to-chart-4 flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm">
          <BotIcon className="size-4 text-white dark:text-primary-foreground" />
        </span>
        <span className="aui-grad-text truncate text-sm leading-none font-semibold tracking-tight">
          {appTitle}
        </span>
      </div>

      <ThreadListPrimitive.New
        onClick={onCloseMobile}
        className="aui-lift bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.99] flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium shadow-sm"
      >
        <PlusIcon className="size-4" />
        {t("newChat")}
      </ThreadListPrimitive.New>

      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        <ThreadListPrimitive.Root className="flex min-h-0 flex-1 flex-col gap-0.5">
          {threadCount === 0 ? (
            <p className="text-muted-foreground px-2 py-4 text-xs">
              {t("noThreads")}
            </p>
          ) : (
            <ThreadListPrimitive.Items>
              {() => (
                <ThreadListItem
                  onDelete={(id, title) => setDeletingTarget({ id, title })}
                />
              )}
            </ThreadListPrimitive.Items>
          )}
        </ThreadListPrimitive.Root>
      </div>
    </>
  );

  return (
    <>
      {/* 桌面侧边栏 */}
      <aside className="bg-card/60 hidden h-full w-60 shrink-0 flex-col border-r border-border/60 p-3 backdrop-blur-sm md:flex">
        {list}
      </aside>

      {/* 移动端抽屉 */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="bg-black/40 absolute inset-0 backdrop-blur-[2px]"
            onClick={onCloseMobile}
          />
          <aside className="aui-anim-item bg-card absolute inset-y-0 left-0 flex w-72 flex-col p-3 shadow-xl">
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
                name: deletingTarget.title || deletingTarget.id,
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
                onClick={confirmDelete}
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
