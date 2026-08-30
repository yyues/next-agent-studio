"use client";

import { useEffect, type FC } from "react";
import { useRouter } from "@/i18n/navigation";
import { Assistant } from "../assistant";
import { SettingsMenu } from "@/components/assistant-ui/settings-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  getClientRuntimeContext,
  setClientRuntimeContext,
} from "@/lib/client-runtime-context";

/**
 * 对话页客户端壳（动态路由 /chat/<chatId>）：
 * - chatId 来自动态路由段，作为 Assistant 的 remount key，每次对话独立
 * - URL 的 roleId（query）同步到运行时上下文，覆盖本地存储
 * - 切换角色时生成新 chatId 并 replace 到 /chat/<newId>?roleId=<role>
 *   → 页面重渲染 → Assistant remount → 全新对话，不复用旧会话
 */
type ChatClientProps = {
  chatId: string;
  initialRoleId?: string;
};

function newChatId(): string {
  return crypto.randomUUID();
}

export const ChatClient: FC<ChatClientProps> = ({ chatId, initialRoleId }) => {
  const router = useRouter();

  // URL roleId 同步到运行时上下文（供 transport / API 使用）
  useEffect(() => {
    if (!initialRoleId) return;
    const ctx = getClientRuntimeContext();
    if (ctx.roleId !== initialRoleId) {
      setClientRuntimeContext({ roleId: initialRoleId });
    }
  }, [initialRoleId]);

  // 切换角色 → 新建对话：生成新 chatId，replace 到 /chat/<newId>?roleId=<role>
  const handleRoleSwitch = (roleId: string) => {
    router.replace(
      `/chat/${newChatId()}?roleId=${encodeURIComponent(roleId)}`,
    );
  };

  return (
    <div className="relative h-dvh">
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
        <SettingsMenu onRoleSwitch={handleRoleSwitch} />
      </div>
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
        <ThemeToggle />
      </div>
      <div className="h-dvh flex flex-col">
        <div className="flex-1 min-h-0">
          {/* key 随 chatId 变化 → 切换角色/新建对话时 remount runtime，得到全新线程 */}
          <Assistant
            key={chatId}
            conversationId={chatId}
            roleId={initialRoleId}
          />
        </div>
      </div>
    </div>
  );
};
