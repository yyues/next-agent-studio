"use client";

import {
  AssistantRuntimeProvider,
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  WebSpeechDictationAdapter,
  useAui,
  useAuiState,
  useRemoteThreadListRuntime,
  type MessageFormatAdapter,
  type RemoteThreadListAdapter,
} from "@assistant-ui/react";
import {
  AssistantChatTransport,
  useChatRuntime,
} from "@assistant-ui/ai-sdk";
import { createAssistantStreamController } from "assistant-stream";
import {
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import { useCallback, useEffect, useMemo, useState, type FC, type ReactNode, useRef } from "react";
import { getClientRuntimeContext, setClientRuntimeContext } from "@/lib/client-runtime-context";
import {
  localConversationStore,
  reportLocalConversationStorageError,
} from "@/lib/local-conversation-store";
import { PlanQuestionsTool } from "@/components/assistant-ui/plan-questions-tool";

const userId = () => getClientRuntimeContext().userId;

/**
 * adapter.fetch 预取到的本地会话内容,由 history.load 一次性消费。
 */
const prefetchedHistories = new Map<string, { messages: UIMessage[]; roleId?: string }>();

/** 从消息列表推导标题:首条用户消息文本前 30 字符(generateTitle 与兜底重命名共用) */
function firstUserTitle(
  messages: readonly {
    role: string;
    content?: readonly { type: string; text?: string }[];
  }[],
): string {
  for (const message of messages) {
    if (message.role !== "user") continue;
    const parts = message.content ?? (message as { parts?: readonly { type: string; text?: string }[] }).parts ?? [];
    const text = parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ")
      .trim()
      .slice(0, 30);
    if (text) return text;
  }
  return "";
}

/**
 * 线程级 runtime adapter(history):线程挂载时从 IndexedDB 加载消息。
 */
const useThreadAdapters = () => {
  const aui = useAui();

  return useMemo(
    () => ({
      history: {
        // 仓库格式入口(useChatRuntime 实际走 withFormat 路径,这里仅满足接口)
        async load() {
          return { messages: [] };
        },
        // useChatRuntime 要求实现 withFormat:存储按数组顺序线性串成 parent 链
        withFormat: <TMessage, TStorageFormat extends Record<string, unknown>>(
          fa: MessageFormatAdapter<TMessage, TStorageFormat>,
        ) => ({
          async load(): Promise<{ messages: ReturnType<typeof fa.decode>[] }> {
            const { remoteId } = aui.threadListItem.getState();
            if (!remoteId) return { messages: [] };
            // fetch 已取过同一条会话时直接消费,避免重复 IndexedDB 读取
            const prefetched = prefetchedHistories.get(remoteId);
            if (prefetched) prefetchedHistories.delete(remoteId);
            let stored: UIMessage[] = prefetched?.messages ?? [];
            let storedRoleId: string | undefined = prefetched?.roleId;
            if (!prefetched) {
              try {
                const storedConversation = await localConversationStore.get(userId(), remoteId);
                stored = storedConversation?.messages ?? [];
                storedRoleId = storedConversation?.roleId;
              } catch {
                reportLocalConversationStorageError();
                stored = [];
              }
            }
            // 会话记录带有角色 → 切换回该会话时恢复其角色(当前会话内切换只影响后续消息)
            if (storedRoleId && storedRoleId !== getClientRuntimeContext().roleId) {
              setClientRuntimeContext({ roleId: storedRoleId });
            }
            let parentId: string | null = null;
            const messages = stored.map((m) => {
              const { id, ...content } = m;
              const item = fa.decode({
                id,
                parent_id: parentId,
                format: fa.format,
                content: content as unknown as TStorageFormat,
              });
              parentId = id;
              return item;
            });
            return { messages };
          },
          async append() {},
        }),
        async append() {},
      },
    }),
    [aui],
  );
};

/**
 * RemoteThreadListAdapter 实现,使用 IndexedDB 保存会话元数据和消息。
 */
const createConversationAdapter = (): RemoteThreadListAdapter => ({
  async list() {
    try {
      const conversations = await localConversationStore.list(userId());
      return {
        threads: conversations.map((c) => ({
        status: "regular" as const,
        remoteId: c.conversationId,
        title: c.title || undefined,
          lastMessageAt: new Date(c.updatedAt),
      })),
      };
    } catch {
      reportLocalConversationStorageError();
      return { threads: [] };
    }
  },

  async initialize(threadId) {
    try {
      await localConversationStore.ensure(userId(), threadId, getClientRuntimeContext().roleId);
    } catch {
      reportLocalConversationStorageError();
    }
    return { remoteId: threadId };
  },

  async rename(remoteId, newTitle) {
    try {
      await localConversationStore.rename(userId(), remoteId, newTitle);
    } catch {
      reportLocalConversationStorageError();
    }
  },

  async archive() {
    // 后端无归档能力,空实现保持接口完整
  },

  async unarchive() {},

  async delete(remoteId) {
    try {
      await localConversationStore.delete(userId(), remoteId);
    } catch {
      reportLocalConversationStorageError();
    }
  },

  async generateTitle(_remoteId, messages) {
    const title = firstUserTitle(messages);
    const [stream, controller] = createAssistantStreamController();
    controller.appendText(title || "新对话");
    controller.close();
    return stream;
  },

  unstable_useAdapters: useThreadAdapters,

  async fetch(remoteId) {
    try {
      const data = await localConversationStore.get(userId(), remoteId);
      if (!data) return { status: "regular" as const, remoteId };
      prefetchedHistories.set(remoteId, {
        messages: data.messages,
        roleId: data.roleId,
      });
      return {
        status: "regular" as const,
        remoteId,
        title: data.title || undefined,
        lastMessageAt: new Date(data.updatedAt),
      };
    } catch {
      reportLocalConversationStorageError();
      return { status: "regular" as const, remoteId };
    }
  },
});

type AssistantProps = {
  /** 当前会话 id(来自路由),作为受控 threadId 同步 URL 与运行时 */
  conversationId: string;
  /** 运行时切换线程时回调(如同步到路由) */
  onThreadIdChange?: (threadId: string) => void;
  children: ReactNode;
};
/**
 * 会话列表型运行时:
 * - 侧边栏通过 ThreadListPrimitive 消费同一运行时,切换/新建/重命名/删除
 *   全部走 IndexedDB adapter,不向服务端持久化会话
 * - 历史消息由 adapter 的 unstable_useAdapters(history)在线程挂载时按 remoteId 加载,
 *   Provider 全程保持挂载,切换会话只重渲染会话内容区
 * - 线程切换时 onThreadIdChange 上抛,父组件负责同步路由
 * - 角色取自运行时上下文(实时读取):当前会话内切换角色后,后续消息即用新角色
 */
export const Assistant: FC<AssistantProps> = ({ conversationId, onThreadIdChange, children }) => {
  // 当前线程 id:仅取挂载时路由 prop 作初值,之后由线程切换回调维护。
  // (URL 同步走原生 history,page 不会重新取参,渲染期回写会把 ref 重置成旧值)
  const activeIdRef = useRef(conversationId);
  const [callbacksReady, setCallbacksReady] = useState(false);

  useEffect(() => {
    setCallbacksReady(true);
  }, []);

  const runtimeHook = useCallback(() => {
    // 运行时上下文里的当前线程(每个线程各自挂载一次 hook),
    // 发消息/保存时从这取实时 remoteId,避免新建线程尚未同步 URL 时写错会话
    const aui = useAui();
    const currentConversationId = () =>
      aui.threadListItem.getState().remoteId ?? aui.threadListItem.getState().id;

    // 标题兜底:URL 直接挂载的线程(如切角色产生的 /chat/<id>?roleId=...)
    // 不经"new → initialize"链路,运行时的自动标题不会订阅;这里在
    // 标题仍为空且已有用户消息时主动重命名(规则与 generateTitle 一致)
    const itemTitle = useAuiState((s) => s.threadListItem.title);
    const derivedTitle = useAuiState((s) => firstUserTitle(s.thread.messages));
    useEffect(() => {
      if (itemTitle || !derivedTitle) return;
      const state = aui.threadListItem.getState();
      if (state.status === "new") return; // 内置自动标题链路负责
      try {
        void aui.threads.item({ id: state.id }).rename(derivedTitle);
      } catch {
        // 状态竞争(如刚好被删除)忽略
      }
    }, [itemTitle, derivedTitle, aui]);

    return useChatRuntime({
      // 工具循环自动续发;MCP 工具审批(HITL)通过/拒绝后同样自动续发
      sendAutomaticallyWhen: (m) =>
        lastAssistantMessageIsCompleteWithToolCalls(m) ||
        lastAssistantMessageIsCompleteWithApprovalResponses(m),
      // 官方附件适配器:图片转 data URL(视觉输入),文本包成标签注入;
      // 不配置时默认接受全部类型,多数模型会报错(官方文档警告)
      adapters: {
        attachments: new CompositeAttachmentAdapter([
          new SimpleImageAttachmentAdapter(),
          new SimpleTextAttachmentAdapter(),
        ]),
        // 浏览器原生 Web Speech 听写(Composer 的麦克风按钮由此激活)
        dictation: new WebSpeechDictationAdapter(),
      },
      onFinish: ({ messages }: { messages: UIMessage[] }) => {
        if (messages.length === 0) return;
        const context = getClientRuntimeContext();
        void localConversationStore
          .save(context.userId, currentConversationId(), context.roleId, messages)
          .catch(() => reportLocalConversationStorageError());
      },
      transport: new AssistantChatTransport({
        api: "/api/chat",
        body: () => {
          const context = getClientRuntimeContext();
          return {
            userId: context.userId,
            roleId: context.roleId,
            conversationId: currentConversationId(),
            deepThinking: context.deepThinking === true,
          };
        },
        headers: () => ({
          "x-user-id": getClientRuntimeContext().userId,
        }),
      }),
    });
  }, []);

  const adapter = useMemo(createConversationAdapter, []);

  const runtime = useRemoteThreadListRuntime({
    adapter,
    runtimeHook,
    threadId: conversationId,
    onThreadIdChange: callbacksReady
      ? (id) => {
          if (id && id !== activeIdRef.current) {
            activeIdRef.current = id;
            onThreadIdChange?.(id);
          }
        }
      : undefined,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <PlanQuestionsTool />
      {children}
    </AssistantRuntimeProvider>
  );
};
