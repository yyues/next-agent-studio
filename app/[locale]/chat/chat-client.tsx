"use client";

import { useEffect, useState, type FC } from "react";
import { useRouter } from "@/i18n/navigation";
import { Assistant } from "../assistant";
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
import type { UIMessage } from "ai";
import { PanelLeftIcon, MenuIcon } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * 对话页客户端壳(动态路由 /chat/<chatId>):
 * - 双栏布局:左侧固定会话侧边栏(可折叠/移动端抽屉) + 右侧主区(顶栏 + Thread)
 * - 挂载时从服务端加载该会话历史,有则作为 initialMessages 传给 Assistant
 * - chatId 来自动态路由段,作为 Assistant 的 remount key,每次对话独立
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

  // 历史加载:loading → ready(可能为空)
  const [history, setHistory] = useState<UIMessage[] | null>(null);

  // URL roleId 同步到运行时上下文(供 transport / API 使用)
  useEffect(() => {
    if (!initialRoleId) return;
    const ctx = getClientRuntimeContext();
    if (ctx.roleId !== initialRoleId) {
      setClientRuntimeContext({ roleId: initialRoleId });
    }
  }, [initialRoleId]);

  // 加载会话历史(chatId 变化时重载)
  useEffect(() => {
    let cancelled = false;
    setHistory(null);
    void (async () => {
      try {
        const userId = getClientRuntimeContext().userId;
        const res = await fetch(
          `/api/conversations/${encodeURIComponent(chatId)}?userId=${encodeURIComponent(userId)}`,
        );
        if (!res.ok) throw new Error("load failed");
        const data = (await res.json()) as { messages?: UIMessage[] };
        if (!cancelled) setHistory(data.messages ?? []);
      } catch {
        if (!cancelled) setHistory([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  // 切换角色 → 新建对话:生成新 chatId,replace 到 /chat/<newId>?roleId=<role>
  const handleRoleSwitch = (roleId: string) => {
    router.replace(
      `/chat/${crypto.randomUUID()}?roleId=${encodeURIComponent(roleId)}`,
    );
  };

  return (
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
            onClick={() =>
              setMobileSidebarOpen((v) => !v)
            }
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
          {history === null ? (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
              {t("loading")}
            </div>
          ) : (
            /* key 随 chatId 变化 → 切换会话/角色时 remount runtime,加载对应历史 */
            <Assistant
              key={chatId}
              conversationId={chatId}
              roleId={initialRoleId}
              initialMessages={history}
            />
          )}
        </div>
      </div>
    </div>
  );
};
