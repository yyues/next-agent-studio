"use client";

import { useEffect, useRef, useState } from "react";
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

interface Props {
  user: UserInfo | null;
  initialConfig: PublicConfig;
}

export function ChatApp({ user, initialConfig }: Props) {
  const isGuest = !user;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
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
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  // 初始化
  useEffect(() => {
    if (user) {
      api
        .getProviderSettings()
        .then(setSavedSettings)
        .catch(() => {})
        .finally(() => setLoadingConvos(false));
      api.listConversations().then(setConversations).catch(() => {});
    } else {
      setLoadingConvos(false);
    }
  }, [user]);

  // 自动滚到底
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function selectConversation(id: string) {
    if (sending) return;
    setActiveId(id);
    setLoadingMsgs(true);
    setError("");
    try {
      const data = await api.getConversation(id);
      setMessages(data.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载消息失败");
    } finally {
      setLoadingMsgs(false);
    }
  }

  async function newConversation() {
    if (sending || !user) return;
    try {
      const conv = await api.createConversation();
      setConversations((prev) => [conv, ...prev]);
      setActiveId(conv.id);
      setMessages([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "新建会话失败");
    }
  }

  async function deleteConversation(id: string) {
    if (sending || !user) return;
    if (!confirm("确定删除这个会话？")) return;
    try {
      await api.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  }

  // 发送消息（SSE 流式）
  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    let convId = activeId;
    if (user && !convId) {
      try {
        const conv = await api.createConversation();
        setConversations((prev) => [conv, ...prev]);
        setActiveId(conv.id);
        convId = conv.id;
      } catch (e) {
        setError(e instanceof Error ? e.message : "新建会话失败");
        return;
      }
    }

    setInput("");
    setSending(true);
    setError("");

    const userMsg: ChatMessage = { role: "user", content: text };
    const assistantMsg: ChatMessage = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: convId,
          message: text,
          ...(isGuest && guestConfig
            ? {
                apiKey: guestConfig.apiKey,
                baseUrl: guestConfig.baseUrl,
                model: guestConfig.model,
              }
            : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        let msg = `请求失败 (${res.status})`;
        try {
          const d = await res.json();
          if (d?.error) msg = d.error;
        } catch {
          // ignore
        }
        throw new Error(msg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const lines = part.split("\n");
          let eventType = "message";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7);
            else if (line.startsWith("data: ")) dataStr = line.slice(6);
          }
          if (!dataStr) continue;
          let data: unknown;
          try {
            data = JSON.parse(dataStr);
          } catch {
            continue;
          }
          const d = data as { delta?: string; content?: string; error?: string };

          if (eventType === "delta" && typeof d.delta === "string") {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = {
                  ...last,
                  content:
                    (typeof last.content === "string" ? last.content : "") +
                    d.delta,
                };
              }
              return next;
            });
          } else if (eventType === "error") {
            setError(d.error ?? "生成失败");
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError(e instanceof Error ? e.message : "发送失败");
      }
    } finally {
      setSending(false);
      abortRef.current = null;
      if (user) {
        api.listConversations().then(setConversations).catch(() => {});
      }
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function handleLogout() {
    await api.logout();
    window.location.href = "/login";
  }

  function handleSettingsSaved(settings: ProviderSettings & { apiKey?: string }) {
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
  }

  function handleSettingsCleared() {
    if (user) {
      setSavedSettings(null);
    } else {
      setGuestConfig(null);
    }
    setSettingsOpen(false);
  }

  // 计算空状态类型
  const emptyState: "guest-empty" | "no-conversation" | "no-messages" =
    !user ? "guest-empty" : !activeId ? "no-conversation" : "no-messages";

  return (
    <div className="flex h-screen">
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

      <main className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-neutral-200 px-4 py-2 flex items-center gap-3">
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
            className="text-xs text-neutral-600 hover:text-neutral-900 px-2 py-1 rounded border border-neutral-300"
          >
            {effectiveSettings ? "API 配置 ✓" : "API 设置"}
          </button>
        </div>

        {loadingMsgs ? (
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 text-neutral-400">加载消息中…</div>
          </div>
        ) : (
          <MessageList
            ref={scrollRef}
            messages={messages}
            sending={sending}
            emptyState={emptyState}
            hasProvider={hasProvider}
          />
        )}

        {error && (
          <div className="max-w-3xl mx-auto w-full px-4">
            <p className="text-sm text-red-600 mb-2">{error}</p>
          </div>
        )}

        <MessageComposer
          value={input}
          onChange={setInput}
          onSend={send}
          onStop={stop}
          sending={sending}
          disabled={!input.trim() || !hasProvider}
          placeholder={
            !hasProvider
              ? "请先在「API 设置」中填写配置"
              : user && !activeId
                ? "点击新对话后开始聊天"
                : "输入消息，Enter 发送，Shift+Enter 换行"
          }
        />
      </main>

      {settingsOpen && (
        <ProviderSettingsDialog
          user={user}
          initialConfig={initialConfig}
          savedSettings={effectiveSettings}
          onClose={() => setSettingsOpen(false)}
          onSaved={handleSettingsSaved}
          onCleared={handleSettingsCleared}
        />
      )}
    </div>
  );
}
