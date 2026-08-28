"use client";

import { useCallback, useRef, useState } from "react";
import {
  useExternalStoreRuntime,
  type ExternalStoreAdapter,
  type ThreadMessage,
  type AppendMessage,
  type TextMessagePart,
  type ThreadUserMessagePart,
  generateId,
} from "@assistant-ui/react";
import type { ChatMessage } from "@/lib/api";

// 将我们的 ChatMessage[] 转换为 assistant-ui 的 ThreadMessage[]
function convertMessages(messages: ChatMessage[]): ThreadMessage[] {
  return messages.map((m) => {
    const id = m.id ?? generateId();
    const createdAt = new Date();
    const text = typeof m.content === "string" ? m.content : String(m.content ?? "");

    if (m.role === "user") {
      return {
        id,
        role: "user",
        content: [{ type: "text", text } as ThreadUserMessagePart],
        createdAt,
        attachments: [],
        metadata: {
          unstable_state: undefined,
          unstable_annotations: undefined,
          unstable_data: undefined,
          steps: undefined,
          submittedFeedback: undefined,
          timing: undefined,
          custom: {},
        },
      } as ThreadMessage;
    } else {
      return {
        id,
        role: "assistant",
        content: [{ type: "text", text, status: { type: "complete" } } as TextMessagePart],
        createdAt,
        status: { type: "complete", reason: "stop" },
        metadata: {
          unstable_state: null,
          unstable_annotations: [],
          unstable_data: [],
          steps: [],
          submittedFeedback: undefined,
          timing: undefined,
          custom: {},
        },
      } as ThreadMessage;
    }
  });
}

// 构造一个空的 assistant 消息（用于流式接收）
function createEmptyAssistantMessage(): ThreadMessage {
  return {
    id: generateId(),
    role: "assistant",
    content: [{ type: "text", text: "", status: { type: "running" } } as TextMessagePart],
    createdAt: new Date(),
    status: { type: "running" },
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      submittedFeedback: undefined,
      timing: undefined,
      custom: {},
    },
  } as ThreadMessage;
}

export interface RuntimeOptions {
  /** 当前会话 ID（游客为 null） */
  conversationId: string | null;
  /** 是否游客模式 */
  isGuest: boolean;
  /** 游客临时配置 */
  guestConfig?: { apiKey: string; baseUrl: string; model: string } | null;
  /** 初始历史消息 */
  initialMessages?: ChatMessage[];
  /** 是否有有效的 provider 配置 */
  hasProvider?: boolean;
  /** 新建会话 */
  onCreateConversation?: () => Promise<string>;
  /** 错误回调 */
  onError?: (error: string) => void;
  /** 会话创建回调 */
  onConversationCreated?: (convId: string) => void;
  /** 会话列表更新回调 */
  onConversationsChanged?: () => void;
}

export function usePiRuntime(options: RuntimeOptions) {
  const abortRef = useRef<AbortController | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessagesState] = useState<ThreadMessage[]>(() =>
    convertMessages(options.initialMessages ?? []),
  );

  // 使用 refs 存储所有动态值，避免闭包陷阱
  const conversationIdRef = useRef(options.conversationId);
  const isGuestRef = useRef(options.isGuest);
  const guestConfigRef = useRef(options.guestConfig);
  const hasProviderRef = useRef(options.hasProvider ?? true);
  const onCreateConversationRef = useRef(options.onCreateConversation);
  const onErrorRef = useRef(options.onError);
  const onConversationCreatedRef = useRef(options.onConversationCreated);
  const onConversationsChangedRef = useRef(options.onConversationsChanged);

  // 同步 refs（每次渲染时更新）
  conversationIdRef.current = options.conversationId;
  isGuestRef.current = options.isGuest;
  guestConfigRef.current = options.guestConfig;
  hasProviderRef.current = options.hasProvider ?? true;
  onCreateConversationRef.current = options.onCreateConversation;
  onErrorRef.current = options.onError;
  onConversationCreatedRef.current = options.onConversationCreated;
  onConversationsChangedRef.current = options.onConversationsChanged;

  const setMessages = useCallback((next: readonly ThreadMessage[]) => {
    setMessagesState([...next]);
  }, []);

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const textParts = message.content.filter((p): p is TextMessagePart => p.type === "text");
      const text = textParts
        .map((p) => p.text)
        .join("\n")
        .trim();
      if (!text) return;

      setIsRunning(true);

      // 1. 把用户消息加入列表
      const userMsg: ThreadMessage = {
        id: generateId(),
        role: "user",
        content: message.content as ThreadUserMessagePart[],
        createdAt: new Date(),
        attachments: [],
        metadata: {
          unstable_state: undefined,
          unstable_annotations: undefined,
          unstable_data: undefined,
          steps: undefined,
          submittedFeedback: undefined,
          timing: undefined,
          custom: {},
        },
      };

      // 2. 创建空的 assistant 消息并加入列表
      const assistantMsg = createEmptyAssistantMessage();
      setMessagesState((prev) => [...prev, userMsg, assistantMsg]);

      // 3. 确定会话 ID
      let convId = conversationIdRef.current;
      if (!convId && !isGuestRef.current) {
        try {
          const createFn = onCreateConversationRef.current;
          if (createFn) {
            convId = await createFn();
            if (convId) {
              onConversationCreatedRef.current?.(convId);
            }
          }
        } catch (e) {
          setIsRunning(false);
          onErrorRef.current?.(e instanceof Error ? e.message : "新建会话失败");
          return;
        }
      }

      // 4. 发起 SSE 流式请求
      const controller = new AbortController();
      abortRef.current = controller;
      let currentText = "";

      try {
        const res = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            conversationId: convId,
            message: text,
            ...(isGuestRef.current && guestConfigRef.current
              ? {
                  apiKey: guestConfigRef.current!.apiKey,
                  baseUrl: guestConfigRef.current!.baseUrl,
                  model: guestConfigRef.current!.model,
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

        // 5. 解析 SSE 流
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
              currentText += d.delta;
              // 实时更新最后一条 assistant 消息
              setMessagesState((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === "assistant") {
                  next[next.length - 1] = {
                    ...last,
                    content: [
                      {
                        type: "text",
                        text: currentText,
                        status: { type: "running" },
                      } as TextMessagePart,
                    ],
                  } as ThreadMessage;
                }
                return next;
              });
            } else if (eventType === "error") {
              onErrorRef.current?.(d.error ?? "生成失败");
            }
          }
        }

        // 6. 完成流，更新最终消息状态
        setMessagesState((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant") {
            next[next.length - 1] = {
              ...last,
              content: [
                {
                  type: "text",
                  text: currentText,
                  status: { type: "complete" },
                } as TextMessagePart,
              ],
              status: { type: "complete", reason: "stop" },
            } as ThreadMessage;
          }
          return next;
        });
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          onErrorRef.current?.(e instanceof Error ? e.message : "发送失败");
          // 标记最后一条消息为错误
          setMessagesState((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") {
              next[next.length - 1] = {
                ...last,
                content: [
                  {
                    type: "text",
                    text: currentText,
                    status: { type: "incomplete", reason: "error" },
                  } as TextMessagePart,
                ],
                status: {
                  type: "incomplete",
                  reason: "error",
                  error: { message: e instanceof Error ? e.message : "发送失败" },
                },
              } as ThreadMessage;
            }
            return next;
          });
        } else {
          // 用户主动取消
          setMessagesState((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant") {
              next[next.length - 1] = {
                ...last,
                content: [
                  {
                    type: "text",
                    text: currentText,
                    status: { type: "incomplete", reason: "cancelled" },
                  } as TextMessagePart,
                ],
                status: { type: "incomplete", reason: "cancelled" },
              } as ThreadMessage;
            }
            return next;
          });
        }
      } finally {
        abortRef.current = null;
        setIsRunning(false);
        onConversationsChangedRef.current?.();
      }
    },
    // 空依赖数组：所有动态值通过 ref 获取
    [],
  );

  const onCancel = useCallback(async () => {
    abortRef.current?.abort();
  }, []);

  const onDelete = useCallback(async (messageId: string) => {
    setMessagesState((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  const onEdit = useCallback(async (message: AppendMessage) => {
    setMessagesState((prev) =>
      prev.map((m) => {
        if (m.id === message.sourceId) {
          return {
            ...m,
            content: message.content as ThreadUserMessagePart[],
          } as ThreadMessage;
        }
        return m;
      }),
    );
  }, []);

  const adapter: ExternalStoreAdapter = {
    messages,
    setMessages,
    onNew,
    onCancel,
    onDelete,
    onEdit,
    isDisabled: false,
    isSendDisabled: !hasProviderRef.current,
    isRunning,
  };

  return useExternalStoreRuntime(adapter);
}
