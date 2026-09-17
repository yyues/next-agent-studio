"use client";

import { useEffect, useState, type FC } from "react";
import { useRouter } from "@/i18n/navigation";
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
};

export const ChatClient: FC<ChatClientProps> = ({
  chatId,
  initialRoleId,
  appTitle = "Agent Studio",
}) => {
  const t = useTranslations("common");
  const router = useRouter();
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

  // 切换角色 → 新建对话:生成新 chatId,replace 到 /chat/<newId>?roleId=<role>
  const handleRoleSwitch = (roleId: string) => {
    router.replace(
      `/chat/${crypto.randomUUID()}?roleId=${encodeURIComponent(roleId)}`,
    );
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
      roleId={initialRoleId}
      onThreadIdChange={handleThreadIdChange}
    >
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
            <Thread />
          </div>
        </div>
      </div>
    </Assistant>
  );
};
