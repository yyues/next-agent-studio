"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type Conversation,
  type ChatMessage,
  type UserInfo,
  type PublicConfig,
  type ProviderSettings,
} from "@/lib/api";
import { ConversationSidebar } from "@/components/chat/ConversationSidebar";
import { MessageList } from "@/components/chat/MessageList";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { ProviderSettingsDialog } from "@/components/settings/ProviderSettingsDialog";
import { AssistantRuntimeProvider, useAuiState } from "@assistant-ui/react";
import { usePiRuntime } from "@/lib/assistant-runtime";
import { clsx } from "clsx";

interface Props {
  user: UserInfo | null;
  initialConfig: PublicConfig;
}

export function ChatApp({ user, initialConfig }: Props) {
  const isGuest = !user;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savedSettings, setSavedSettings] = useState<ProviderSettings | null>(null);
  // 游客临时配置（仅内存，含明文 apiKey 用于请求；不持久化）
  const [guestConfig, setGuestConfig] = useState<{
    apiKey: string;
    baseUrl: string;
    model: string;
  } | null>(null);
  // 切换会话时加载的历史消息，传递给 runtime
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([]);
  // 新建会话计数器，用于生成 runtimeKey
  const [newConvCount, setNewConvCount] = useState(0);
  // 会话切换计数（侧边栏切换才递增；runtime 自动创建会话不递增，避免重建 runtime 导致消息闪退）
  const [switchCount, setSwitchCount] = useState(0);

  // 已保存的配置标志（DB 或游客临时）；游客构造展示用对象
  const effectiveSettings: ProviderSettings | null = user
    ? savedSettings
    : guestConfig
      ? {
          baseUrl: guestConfig.baseUrl,
          model: guestConfig.model,
          apiKeyHint:
            guestConfig.apiKey.length <= 8
              ? "•".repeat(guestConfig.apiKey.length)
              : `${guestConfig.apiKey.slice(0, 4)}${"•".repeat(4)}${guestConfig.apiKey.slice(-4)}`,
          hasApiKey: true,
        }
      : null;
  const hasProvider = !!effectiveSettings || initialConfig.hasDefaultProvider;

  // runtime key：仅在「新建会话按钮」「侧边栏切换」「游客→非游客」等情况下重建
  //   - runtime 内部自动创建会话（handleConversationCreated）不会触发重建，避免消息"闪退"
  const runtimeKey = isGuest ? "guest" : `s${switchCount}-${activeId ?? `new-${newConvCount}`}`;

  // 初始化：加载会话列表和 provider 设置
  useEffect(() => {
    if (user) {
      api
        .getProviderSettings()
        .then(setSavedSettings)
        .catch(() => {})
        .finally(() => setLoadingConvos(false));
      api
        .listConversations()
        .then(setConversations)
        .catch(() => {});
    } else {
      setLoadingConvos(false);
    }
  }, [user]);

  // 切换会话
  const selectConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setSwitchCount((c) => c + 1);
    setLoadingMsgs(true);
    setError("");
    try {
      const data = await api.getConversation(id);
      setPendingMessages(data.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载消息失败");
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  // 新建会话
  const newConversation = useCallback(async () => {
    if (!user) return;
    try {
      const conv = await api.createConversation();
      setConversations((prev) => [conv, ...prev]);
      setActiveId(conv.id);
      setPendingMessages([]);
      setNewConvCount((c) => c + 1);
      setSwitchCount((c) => c + 1);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "新建会话失败");
    }
  }, [user]);

  // 删除会话
  const deleteConversation = useCallback(
    async (id: string) => {
      if (!user) return;
      if (!confirm("确定删除这个会话？")) return;
      try {
        await api.deleteConversation(id);
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeId === id) {
          setActiveId(null);
          setPendingMessages([]);
          setNewConvCount((c) => c + 1);
          setSwitchCount((c) => c + 1);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "删除失败");
      }
    },
    [activeId, user],
  );

  // 创建新会话（供 runtime 自动创建使用）
  const handleCreateConversation = useCallback(async () => {
    const conv = await api.createConversation();
    setConversations((prev) => [conv, ...prev]);
    return conv.id;
  }, []);

  // 会话创建回调（runtime 自动创建后通知）
  const handleConversationCreated = useCallback((convId: string) => {
    setActiveId(convId);
  }, []);

  // 会话列表刷新回调（每次流完成后触发）
  const handleConversationsChanged = useCallback(() => {
    if (user) {
      api
        .listConversations()
        .then(setConversations)
        .catch(() => {});
    }
  }, [user]);

  // 登出
  const handleLogout = useCallback(async () => {
    await api.logout();
    window.location.href = "/login";
  }, []);

  // 保存设置
  const handleSettingsSaved = useCallback(
    (settings: ProviderSettings & { apiKey?: string }) => {
      if (user) {
        setSavedSettings(settings);
      } else {
        setGuestConfig({
          apiKey: settings.apiKey ?? "",
          baseUrl: settings.baseUrl,
          model: settings.model,
        });
      }
      setSettingsOpen(false);
    },
    [user],
  );

  // 清除设置
  const handleSettingsCleared = useCallback(() => {
    if (user) {
      setSavedSettings(null);
    } else {
      setGuestConfig(null);
    }
    setSettingsOpen(false);
  }, [user]);

  // Composer placeholder
  const composerPlaceholder = !hasProvider
    ? "请先在「API 设置」中填写配置"
    : user && !activeId
      ? "点击新对话后开始聊天"
      : "输入消息，Enter 发送，Shift+Enter 换行";

  return (
    // 参考 antdx layout: w-full h-screen flex bg-container overflow-hidden
    <div className="flex h-screen w-full overflow-hidden bg-white">
      {user && (
        <ConversationSidebar
          user={user}
          conversations={conversations}
          activeId={activeId}
          loading={loadingConvos}
          onSelect={selectConversation}
          onNew={newConversation}
          onDelete={deleteConversation}
          onLogout={handleLogout}
        />
      )}

      {/* 参考 antdx chat: w-[calc(100%-240px)] flex-col overflow-auto box-sizing */}
      <main
        className={clsx(
          "box-border flex min-h-0 flex-col",
          user ? "w-[calc(100%-280px)]" : "w-full",
        )}
      >
        {/* 顶部状态栏 — 保留功能 */}
        <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2">
          <div className="flex-1 text-sm text-neutral-500">
            {isGuest ? (
              <span>
                游客模式 · 消息不保存 ·{" "}
                <a href="/login" className="text-neutral-900 underline">
                  登录
                </a>{" "}
                可保存配置与历史
              </span>
            ) : (
              <span>已登录</span>
            )}
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:text-neutral-900"
          >
            {effectiveSettings ? "API 配置 ✓" : "API 设置"}
          </button>
        </div>

        {loadingMsgs ? (
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto p-6" style={{ maxWidth: 940 }}>
              <p className="text-neutral-400">加载消息中…</p>
            </div>
          </div>
        ) : (
          <ChatRuntimeWrapper
            key={runtimeKey}
            conversationId={activeId}
            isGuest={isGuest}
            guestConfig={guestConfig}
            initialMessages={pendingMessages}
            hasProvider={hasProvider}
            onCreateConversation={handleCreateConversation}
            onConversationCreated={handleConversationCreated}
            onConversationsChanged={handleConversationsChanged}
            onError={setError}
            composerPlaceholder={composerPlaceholder}
          />
        )}

        {error && (
          <div className="mx-auto w-full shrink-0 px-4" style={{ maxWidth: 940 }}>
            <p className="mb-2 text-sm text-red-600">{error}</p>
          </div>
        )}
      </main>

      {/* Antd Modal 自带 open 控制，不需要条件渲染（保证 destroyOnHidden 生效） */}
      <ProviderSettingsDialog
        user={user}
        initialConfig={initialConfig}
        savedSettings={effectiveSettings}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={handleSettingsSaved}
        onCleared={handleSettingsCleared}
      />
    </div>
  );
}

/**
 * 内部组件：包装 AssistantRuntimeProvider
 * 通过 key 属性在切换会话时强制重建 runtime
 *
 * 参考 antdx 空页/有消息页两种布局：
 * - 空页: chatSender 变 startPage（整体居中 + 大标题 agentName）
 * - 有消息: chatList flex1 scroll + chatSender 固定底部
 */
interface ChatRuntimeWrapperProps {
  conversationId: string | null;
  isGuest: boolean;
  guestConfig: { apiKey: string; baseUrl: string; model: string } | null;
  initialMessages: ChatMessage[];
  hasProvider: boolean;
  onCreateConversation: () => Promise<string>;
  onConversationCreated: (convId: string) => void;
  onConversationsChanged: () => void;
  onError: (error: string) => void;
  composerPlaceholder: string;
}

function ChatRuntimeWrapper(props: ChatRuntimeWrapperProps) {
  const runtime = usePiRuntime({
    conversationId: props.conversationId,
    isGuest: props.isGuest,
    guestConfig: props.guestConfig,
    initialMessages: props.initialMessages,
    hasProvider: props.hasProvider,
    onCreateConversation: props.onCreateConversation,
    onConversationCreated: props.onConversationCreated,
    onConversationsChanged: props.onConversationsChanged,
    onError: props.onError,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ChatLayoutInner placeholder={props.composerPlaceholder} />
    </AssistantRuntimeProvider>
  );
}

/**
 * 内层：运行在 runtime 上下文内，可直接读取 useAuiState 判定是否有消息
 */
function ChatLayoutInner({ placeholder }: { placeholder: string }) {
  // 参考 antdx: messages.length===0 时使用 startPage 布局
  const messagesLength = useAuiState((s) => s.thread.messages.length);
  const hasMessages = messagesLength > 0;

  return (
    <div className="mx-auto flex min-h-0 w-full flex-1 flex-col" style={{ maxWidth: 940 }}>
      {/* 参考 antdx chatList: flex-1 overflow-y-auto margin-block-start */}
      {hasMessages && (
        <div className="mt-4 flex min-h-0 flex-1 flex-col">
          <MessageList />
        </div>
      )}

      {/* 参考 antdx chatSender: padding-xs；空消息时 startPage: flex-col items-center h-full */}
      <div
        className={clsx("shrink-0 p-1", !hasMessages && "flex h-full flex-1 flex-col items-center")}
      >
        {!hasMessages && (
          // 参考 antdx agentName: margin-block-start 25% font-size 32px mb 38px font-semibold
          <div
            className="font-semibold text-neutral-900"
            style={{ marginTop: "25%", fontSize: "32px", marginBottom: "38px" }}
          >
            Agent Demo
          </div>
        )}
        <MessageComposer placeholder={placeholder} startPage={!hasMessages} />
      </div>
    </div>
  );
}
