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
  createResumableSessionStorage,
  useChatRuntime,
} from "@assistant-ui/ai-sdk";
import { createAssistantStreamController } from "assistant-stream";
import {
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import { useCallback, useEffect, useMemo, type FC, type ReactNode, useRef } from "react";
import { getClientRuntimeContext, setClientRuntimeContext } from "@/lib/client-runtime-context";
import { CONVERSATION_SAVED_EVENT } from "@/lib/conversation-events";

type ConversationSummary = {
  conversationId: string;
  roleId: string;
  title: string;
  updatedAt?: string;
};

const userId = () => getClientRuntimeContext().userId;

/**
 * adapter.fetch 预取到的会话内容,由 history.load 一次性消费。
 * 领养流程(刷新 /chat/<id>)中 fetch 与 load 命中的是同一条会话,
 * 直接传递可避免第二次重复请求;新会话(空记录)因此瞬时完成加载,
 * 不会出现"骨架屏闪一下又消失"的窗口。一次性消费,后续重新挂载仍走网络取最新。
 */
const prefetchedHistories = new Map<
  string,
  { messages: UIMessage[]; roleId?: string }
>();

/** 从消息列表推导标题:首条用户消息文本前 30 字符(generateTitle 与兜底重命名共用) */
function firstUserTitle(
  messages: readonly {
    role: string;
    content?: readonly { type: string; text?: string }[];
  }[],
): string {
  for (const message of messages) {
    if (message.role !== "user") continue;
    const text = (message.content ?? [])
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
 * 线程级 runtime adapter(history):线程挂载时按 remoteId 加载该会话的历史消息。
 * 这样切换会话只重挂载当前线程的聊天运行时,Provider 外的侧边栏/顶栏不受影响。
 * 持久化仍由 runtimeHook 的 onFinish 整体 PUT 承担,append 为 no-op。
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
            // 领养 fetch 已取过同一条会话 → 直接消费,跳过重复请求
            const prefetched = prefetchedHistories.get(remoteId);
            if (prefetched) prefetchedHistories.delete(remoteId);
            let stored: UIMessage[] = prefetched?.messages ?? [];
            let storedRoleId: string | undefined = prefetched?.roleId;
            if (!prefetched) {
              try {
                const res = await fetch(
                  `/api/conversations/${encodeURIComponent(remoteId)}?userId=${encodeURIComponent(userId())}`,
                );
                if (res.ok) {
                  const data = (await res.json()) as { messages?: UIMessage[]; roleId?: string };
                  stored = data.messages ?? [];
                  storedRoleId = data.roleId;
                }
              } catch {
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
 * RemoteThreadListAdapter 实现,桥接现有 /api/conversations CRUD:
 * - list → GET 列表;initialize 直接采用本地 threadId 作为会话 id
 * - rename → PATCH;delete → DELETE;archive/unarchive 后端无对应能力,空实现
 * - generateTitle 客户端截取首条用户消息生成(无需 LLM),随后核心会调 rename 持久化
 */
const createConversationAdapter = (): RemoteThreadListAdapter => ({
  async list() {
    const res = await fetch(
      `/api/conversations?userId=${encodeURIComponent(userId())}`,
    );
    if (!res.ok) throw new Error("Failed to list conversations.");
    const data = (await res.json()) as { conversations: ConversationSummary[] };
    return {
      threads: (data.conversations ?? []).map((c) => ({
        status: "regular" as const,
        remoteId: c.conversationId,
        title: c.title || undefined,
        lastMessageAt: c.updatedAt ? new Date(c.updatedAt) : undefined,
      })),
    };
  },

  async initialize(threadId) {
    // 新线程沿用本地生成的 id 作为会话主键,首次保存(PUT)时落库
    return { remoteId: threadId };
  },

  async rename(remoteId, newTitle) {
    try {
      await fetch(`/api/conversations/${encodeURIComponent(remoteId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userId(), title: newTitle }),
      });
    } catch {
      // 会话尚未落库时 404/网络失败可容忍,服务端在首次保存时会自动生成标题
    }
  },

  async archive() {
    // 后端无归档能力,空实现保持接口完整
  },

  async unarchive() {},

  async delete(remoteId) {
    await fetch(
      `/api/conversations/${encodeURIComponent(remoteId)}?userId=${encodeURIComponent(userId())}`,
      { method: "DELETE" },
    );
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
    const res = await fetch(
      `/api/conversations/${encodeURIComponent(remoteId)}?userId=${encodeURIComponent(userId())}`,
    );
    if (!res.ok) {
      return { status: "regular" as const, remoteId };
    }
    const data = (await res.json()) as {
      title?: string;
      messages?: UIMessage[];
      roleId?: string;
    };
    // 预取内容交给 history.load 消费(见 prefetchedHistories)
    prefetchedHistories.set(remoteId, {
      messages: data.messages ?? [],
      roleId: data.roleId,
    });
    return {
      status: "regular" as const,
      remoteId,
      title: data.title || undefined,
    };
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
 *   全部走 adapter(即 /api/conversations),不再由组件自行 fetch 维护列表
 * - 历史消息由 adapter 的 unstable_useAdapters(history)在线程挂载时按 remoteId 加载,
 *   Provider 全程保持挂载,切换会话只重渲染会话内容区
 * - 线程切换时 onThreadIdChange 上抛,父组件负责同步路由
 * - 角色取自运行时上下文(实时读取):当前会话内切换角色后,后续消息即用新角色
 */
export const Assistant: FC<AssistantProps> = ({
  conversationId,
  onThreadIdChange,
  children,
}) => {
  // 当前线程 id:仅取挂载时路由 prop 作初值,之后由线程切换回调维护。
  // (URL 同步走原生 history,page 不会重新取参,渲染期回写会把 ref 重置成旧值)
  const activeIdRef = useRef(conversationId);

  const runtimeHook = useCallback(
    () => {
      // 运行时上下文里的当前线程(每个线程各自挂载一次 hook),
      // 发消息/保存时从这取实时 remoteId,避免新建线程尚未同步 URL 时写错会话
      const aui = useAui();
      const currentConversationId = () =>
        aui.threadListItem.getState().remoteId ?? activeIdRef.current;

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
          // 消息反馈(👍/👎):落库到 /api/feedback,按角色聚合质量数据
          feedback: {
            submit: ({ message, type }) => {
              const context = getClientRuntimeContext();
              const snapshot = (message.content ?? [])
                .filter(
                  (p): p is { type: "text"; text: string } => p.type === "text",
                )
                .map((p) => p.text)
                .join(" ")
                .slice(0, 500);
              void fetch("/api/feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  userId: context.userId,
                  conversationId: currentConversationId(),
                  messageId: message.id,
                  roleId: context.roleId,
                  type,
                  snapshot,
                }),
              }).catch(() => undefined);
            },
          },
        },
        onFinish: ({ messages }: { messages: UIMessage[] }) => {
          if (messages.length === 0) return;
          const context = getClientRuntimeContext();
          void fetch(
            `/api/conversations/${encodeURIComponent(currentConversationId())}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: context.userId,
                roleId: context.roleId,
                messages,
              }),
            },
          )
            .then((res) => {
              if (res.ok) {
                window.dispatchEvent(new CustomEvent(CONVERSATION_SAVED_EVENT));
              }
            })
            .catch(() => undefined);
        },
        transport: new AssistantChatTransport({
          api: "/api/chat",
          // 可恢复流:流 id 按线程(会话)维度存 sessionStorage,
          // 刷新/断线后 useChatRuntime 自动经 resume 路由续接未完成的回答
          resumable: {
            storage: createResumableSessionStorage({
              key: () => {
                const item = aui.threadListItem.getState();
                return `aui-resumable:${item.remoteId ?? item.id}`;
              },
            }),
            resumeApi: (streamId) => {
              const userId = getClientRuntimeContext().userId;
              return `/api/chat/resume/${encodeURIComponent(streamId)}?userId=${encodeURIComponent(userId)}`;
            },
          },
          body: () => {
            const context = getClientRuntimeContext();
            return {
              userId: context.userId,
              roleId: context.roleId,
              conversationId: currentConversationId(),
              deepThinking: context.deepThinking === true,
              mcpServerIds: context.mcpServerIds,
            };
          },
          headers: () => ({
            "x-user-id": getClientRuntimeContext().userId,
          }),
        }),
        onResumeError: (error) => {
          // 续接失败(流已过期等)不打断会话,历史里仍有已完成的回合
          console.warn("[assistant] resume stream failed:", error);
        },
      });
    },
    [],
  );

  const adapter = useMemo(createConversationAdapter, []);

  const runtime = useRemoteThreadListRuntime({
    adapter,
    runtimeHook,
    threadId: conversationId,
    onThreadIdChange: (id) => {
      if (id && id !== activeIdRef.current) {
        activeIdRef.current = id;
        onThreadIdChange?.(id);
      }
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
};
