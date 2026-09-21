"use client";

import { useEffect, useRef, useState, type FC } from "react";
import { useAuiState } from "@assistant-ui/react";
import { Assistant } from "../assistant";
import { Thread } from "@/components/assistant-ui/thread";
import { SettingsMenu } from "@/components/assistant-ui/settings-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "@/components/assistant-ui/logout-button";
import {
  ConversationSidebar,
  useSidebarCollapsed,
} from "@/components/assistant-ui/conversation-sidebar";
import {
  getClientRuntimeContext,
  setClientRuntimeContext,
} from "@/lib/client-runtime-context";
import { PanelLeftIcon, MenuIcon } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * 对话页客户端壳(动态路由 /chat/<chatId>):
 * - Assistant 提供线程列表型运行时,侧边栏与 Thread 同处一个 Provider,全程不 remount
 * - 运行时内切换/新建线程 → onThreadIdChange → 原生 history 同步 URL(不触发 Next 导航,避免整页 remount);历史由运行时按线程自行加载
 * - URL 的 roleId(query)同步到运行时上下文,覆盖本地存储
 * - 切换角色时生成新 chatId 并 replace 到 /chat/<newId>?roleId=<role>
 */
type ChatClientProps = {
  chatId: string;
  initialRoleId?: string;
  /** 应用标题(来自 APP_TITLE env,服务端注入) */
  appTitle?: string;
  /** 服务端确认该 chatId 已落库:刷新时启动窗口显示骨架屏而非新会话欢迎页 */
  expectHistory?: boolean;
};

/**
 * 新对话 URL 兜底同步(必须渲染在 AssistantRuntimeProvider 内部):
 * 点"新对话"切换到的占位线程没有 remoteId,运行时的 onThreadIdChange 不会触发,
 * URL 会停留在旧会话上——刷新就跳回旧会话。
 * 这里监听主线程状态:仅在主线程【变为】新占位线程时把其 id 写入 URL。
 * - 跳过挂载初值:刷新已有会话时的"占位 → 领养"过程不写 URL;
 * - 占位线程发首条消息时 initialize 沿用该 id 落库,URL 全程一致;
 * - 切到已有会话由运行时的 onThreadIdChange 负责,互不冲突。
 */
const NewThreadUrlSync: FC<{ onSync: (threadId: string) => void }> = ({
  onSync,
}) => {
  const newThreadId = useAuiState((s) =>
    s.threadListItem.status === "new" ? s.threadListItem.id : undefined,
  );
  // null = 尚未记录挂载初值
  const prevRef = useRef<string | undefined | null>(null);
  useEffect(() => {
    if (prevRef.current === null) {
      prevRef.current = newThreadId;
      return;
    }
    if (prevRef.current === newThreadId) return;
    prevRef.current = newThreadId;
    if (newThreadId) onSync(newThreadId);
  }, [newThreadId, onSync]);
  return null;
};

export const ChatClient: FC<ChatClientProps> = ({
  chatId,
  initialRoleId,
  appTitle = "Agent Studio",
  expectHistory = false,
}) => {
  const t = useTranslations("common");
  const { collapsed, toggle } = useSidebarCollapsed();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // URL roleId 同步到运行时上下文(供 transport / API 使用)
  useEffect(() => {
    if (!initialRoleId) return;
    const ctx = getClientRuntimeContext();
    if (ctx.roleId !== initialRoleId) {
      setClientRuntimeContext({ roleId: initialRoleId });
    }
  }, [initialRoleId]);

  // 切换角色 → 当前会话继续使用新角色:仅更新 URL 查询参数(不新建会话),
  // 后续消息经运行时上下文实时携带新 roleId
  const handleRoleSwitch = (roleId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("roleId", roleId);
    window.history.replaceState(null, "", url);
  };

  // 线程切换同步 URL:走原生 history 而非 router.push,
  // 避免 Next 对 [chatId] 参数变化整页 remount(线程切换本身由 runtime 完成)
  const handleThreadIdChange = (threadId: string) => {
    const next = window.location.pathname.replace(
      /\/chat\/[^/]+/,
      `/chat/${encodeURIComponent(threadId)}`,
    );
    if (next !== window.location.pathname) {
      window.history.pushState(null, "", next);
    }
  };

  return (
    <Assistant
      conversationId={chatId}
      onThreadIdChange={handleThreadIdChange}
    >
      <NewThreadUrlSync onSync={handleThreadIdChange} />
      <div className="bg-background text-foreground flex h-dvh overflow-hidden">
        <ConversationSidebar
          collapsed={collapsed}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          appTitle={appTitle}
        />

        <div className="flex h-full min-w-0 flex-1 flex-col">
          {/* 顶栏(毛玻璃) */}
          <header className="bg-background/70 border-border/50 sticky top-0 z-20 flex h-12 shrink-0 items-center gap-1.5 border-b px-3 backdrop-blur-md">
            {/* 移动端:打开抽屉;桌面:折叠侧边栏 */}
            <button
              type="button"
              onClick={() => setMobileSidebarOpen((v) => !v)}
              className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-7 items-center justify-center rounded-md transition-colors md:hidden"
              aria-label={t("toggleSidebar")}
            >
              <MenuIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={toggle}
              className="text-muted-foreground hover:text-foreground hover:bg-muted hidden size-7 items-center justify-center rounded-md transition-colors md:inline-flex"
              aria-label={t("toggleSidebar")}
            >
              <PanelLeftIcon className="size-4" />
            </button>

            <div className="flex-1" />

            <SettingsMenu onRoleSwitch={handleRoleSwitch} />
            <ThemeToggle />
            <LogoutButton />
          </header>

          {/* 对话区 */}
          <div className="min-h-0 flex-1">
            <Thread expectHistory={expectHistory} />
          </div>
        </div>
      </div>
    </Assistant>
  );
};
