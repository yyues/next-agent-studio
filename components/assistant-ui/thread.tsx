import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
} from "@/components/assistant-ui/attachment";
import { StreamdownText } from "@/components/assistant-ui/streamdown-text";
import { ToolFallback, prettyToolName } from "@/components/assistant-ui/tool-fallback";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { ConversationTimeline } from "@/components/assistant-ui/conversation-timeline";
import { ComposerSlash, LexicalSlashChip } from "@/components/assistant-ui/composer-slash";
import { ComposerMention } from "@/components/assistant-ui/composer-mention";
import { UserMessageText } from "@/components/assistant-ui/user-message-text";
import { AssistantAttachment } from "@/components/assistant-ui/attachment";
import { GenerateDocumentResult } from "@/components/assistant-ui/generate-document-tool";
import { slashDirectiveFormatter } from "@/lib/slash-directive";
import { LexicalComposerInput } from "@assistant-ui/react-lexical";
import {
  ChipSpacingPlugin,
  insertSpaceAfterSelectedDirective,
} from "@/components/assistant-ui/chip-spacing-plugin";
import { useLexicalComposerInputHistory } from "@/components/assistant-ui/composer-input-history";
import { DeepThinkingToggle } from "@/components/assistant-ui/deep-thinking-toggle";
import { ThinkingIndicator } from "@/components/thinking-indicator";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  RUNTIME_CONTEXT_UPDATED_EVENT,
  getClientRuntimeContext,
} from "@/lib/client-runtime-context";
import { useRolesStore } from "@/lib/roles-store";
import {
  ComposerSuggestionBridge,
  insertSuggestionChip,
} from "@/components/assistant-ui/composer-suggestion-bridge";
import { ComposerPastePlugin } from "@/components/assistant-ui/composer-paste-plugin";
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  type AssistantState,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  MicIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RefreshCwIcon,
  SparklesIcon,
  SquareIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react";
import { type FC, useEffect, useState } from "react";

// Startup exposes a loading placeholder thread; treat it as a new chat so
// the composer mounts centered. Loads after startup keep the docked layout.
const isNewChatView = (s: AssistantState) =>
  s.thread.messages.length === 0 && (!s.thread.isLoading || s.threads.isLoading);

// A switched thread that is still fetching its history: skeleton, not welcome.
const isHistoryLoadingView = (s: AssistantState) =>
  s.thread.messages.length === 0 &&
  s.thread.isLoading &&
  !s.thread.isDisabled &&
  !s.threads.isLoading;

const ThreadHistorySkeleton: FC = () => {
  const t = useTranslations("thread");
  return (
    <div
      data-slot="aui_thread-history-skeleton"
      role="status"
      className="animate-in fade-in fill-mode-both flex flex-col [animation-delay:150ms] animation-duration-[200ms]"
    >
      <span className="sr-only">{t("loadingConversation")}</span>
      <div className="flex animate-pulse flex-col gap-y-6 motion-reduce:animate-none">
        <div className="bg-muted ml-auto h-9 w-2/5 rounded-xl" />
        <div className="flex flex-col gap-y-2">
          <div className="bg-muted h-4 w-11/12 rounded-md" />
          <div className="bg-muted h-4 w-4/5 rounded-md" />
          <div className="bg-muted h-4 w-3/5 rounded-md" />
        </div>
        <div className="bg-muted ml-auto h-9 w-1/3 rounded-xl" />
        <div className="flex flex-col gap-y-2">
          <div className="bg-muted h-4 w-10/12 rounded-md" />
          <div className="bg-muted h-4 w-2/3 rounded-md" />
        </div>
      </div>
    </div>
  );
};

export const Thread: FC<{ expectHistory?: boolean }> = ({ expectHistory = false }) => {
  const isEmpty = useAuiState(isNewChatView);
  const isHistoryLoading = useAuiState(isHistoryLoadingView);
  const composerIsEmpty = useAuiState((s) => s.composer.isEmpty);
  // 主线程仍是占位新线程(未落库/未完成领养)
  const isPlaceholderNew = useAuiState((s) => s.threadListItem.status === "new");
  // 启动闩锁:首次脱离占位线程(领养完成)后,本挂载周期内不再进入启动加载态
  const [startupDone, setStartupDone] = useState(false);
  useEffect(() => {
    if (!isPlaceholderNew) setStartupDone(true);
  }, [isPlaceholderNew]);

  // 服务端确认 URL 是已有会话:启动"占位→领养"窗口显示骨架屏,
  // 而不是新会话欢迎页(否则刷新已有会话会先闪一下欢迎页)。
  // 仅启动窗口生效——之后用户点"新对话"回到占位线程时仍显示欢迎页。
  const isStartupLoading = expectHistory && !startupDone && isPlaceholderNew && isEmpty;

  const showWelcome = isEmpty && !isStartupLoading;
  const showSkeleton = isHistoryLoading || isStartupLoading;

  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root bg-background @container relative flex h-full flex-col"
      style={{
        // 消息列宽由 globals.css 的 .aui-thread-root 按断点自适应(44/52/60rem)
        ["--composer-bg" as string]: "var(--color-card)",
        ["--composer-radius" as string]: "1.5rem",
        ["--composer-padding" as string]: "12px",
      }}
    >
      {/* 对话缩略时间线:每横线一条消息,悬停预览,点击定位 */}
      <ConversationTimeline />
      <ThreadPrimitive.Viewport
        turnAnchor="bottom"
        autoScroll
        data-slot="aui_thread-viewport"
        className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth"
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col px-4 pt-4",
            showWelcome && "justify-center",
          )}
        >
          {showWelcome && <ThreadWelcome />}
          {showSkeleton && <ThreadHistorySkeleton />}

          <div data-slot="aui_message-group" className="mb-14 flex flex-col gap-y-6 empty:hidden">
            <ThreadPrimitive.Messages>{() => <ThreadMessage />}</ThreadPrimitive.Messages>
          </div>

          <ThreadPrimitive.ViewportFooter
            className={cn(
              "aui-thread-viewport-footer bg-background flex flex-col gap-4 overflow-visible pb-4 md:pb-6",
              !showWelcome && "sticky bottom-0 mt-auto rounded-t-(--composer-radius)",
            )}
          >
            <ThreadScrollToBottom />
            <Composer />
            {showWelcome && composerIsEmpty && <ThreadSuggestions />}
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadMessage: FC = () => {
  const role = useAuiState((s) => s.message.role);
  const isEditing = useAuiState((s) => s.message.composer.isEditing);

  if (isEditing) return <EditComposer />;
  if (role === "user") return <UserMessage />;
  return <AssistantMessage />;
};

const ThreadScrollToBottom: FC = () => {
  const t = useTranslations("thread");
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip={t("scrollToBottom")}
        variant="outline"
        className="aui-thread-scroll-to-bottom dark:border-border dark:bg-background dark:hover:bg-accent absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  const t = useTranslations("thread");
  return (
    <div className="aui-thread-welcome-root relative mb-6 flex flex-col items-center px-4 py-8 text-center">
      {/* 装饰光晕(纯背景,不拦截交互) */}
      <div
        aria-hidden
        className="from-primary/10 via-chart-4/10 pointer-events-none absolute top-1/2 left-1/2 h-64 w-[36rem] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r to-transparent blur-3xl"
      />
      <span
        aria-hidden
        className="aui-anim-float bg-primary/10 text-primary relative mb-4 flex size-12 items-center justify-center rounded-2xl"
      >
        <SparklesIcon className="size-5" />
      </span>
      <h1 className="aui-thread-welcome-message-inner aui-grad-text fade-in slide-in-from-bottom-1 animate-in fill-mode-both relative text-3xl font-semibold tracking-tight duration-300">
        {t("welcome")}
      </h1>
    </div>
  );
};

/**
 * 开场建议问题:直接读共享角色列表缓存(lib/roles-store)中当前角色的
 * suggestions 字段(角色详情里可编辑)。点击不直接发送——像 /命令 一样
 * 以内联 chip 填入输入框,用户可续写补充后再发送(chip 文本发送时并入
 * 消息纯文本)。仅在新会话且输入框为空时展示;订阅角色变化同步。
 */
const ThreadSuggestions: FC = () => {
  const t = useTranslations("thread");
  const [roleId, setRoleId] = useState(() => getClientRuntimeContext().roleId);
  const roles = useRolesStore((s) => s.roles);
  const ensureRoles = useRolesStore((s) => s.ensureRoles);

  useEffect(() => {
    void ensureRoles();
  }, [ensureRoles]);

  useEffect(() => {
    const onUpdate = () => setRoleId(getClientRuntimeContext().roleId);
    window.addEventListener(RUNTIME_CONTEXT_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(RUNTIME_CONTEXT_UPDATED_EVENT, onUpdate);
  }, []);

  const suggestions = roles.find((r) => r.roleId === roleId)?.suggestions ?? [];

  if (suggestions.length === 0) return null;

  return (
    <div className="aui-thread-welcome-suggestions flex w-full flex-wrap items-center justify-center gap-2 px-4">
      {suggestions.map((text) => (
        <Button
          key={text}
          variant="ghost"
          className="aui-thread-welcome-suggestion aui-lift text-foreground hover:bg-muted hover:shadow-md border-border/60 fade-in slide-in-from-bottom-2 animate-in h-auto gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-normal whitespace-nowrap fill-mode-both duration-200 active:scale-[0.98] motion-reduce:transition-none"
          title={t("insertSuggestion")}
          onClick={() => insertSuggestionChip(text)}
        >
          {text}
        </Button>
      ))}
    </div>
  );
};

const Composer: FC = () => {
  const t = useTranslations("thread");
  // 输入历史:空输入框 ↑ 召回已发送消息(Lexical 垫片适配官方 hook)
  const inputHistory = useLexicalComposerInputHistory();
  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
        {/* "/" 命令面板 与 "@" MCP 提及面板:锚定在输入框上方 */}
        <ComposerSlash />
        <ComposerMention />
        <ComposerPrimitive.AttachmentDropzone asChild>
          <div
            data-slot="aui_composer-shell"
            className="border-border/60 shadow-sm focus-within:border-primary/40 focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-primary)_10%,transparent)] data-[dragging=true]:border-ring dark:border-muted-foreground/15 dark:focus-within:border-primary/50 flex w-full cursor-text flex-col gap-2 rounded-(--composer-radius) border bg-(--composer-bg) p-(--composer-padding) transition-[border-color,box-shadow] duration-200 data-[dragging=true]:border-dashed data-[dragging=true]:bg-[color-mix(in_oklab,var(--color-accent)_50%,var(--color-background))] motion-reduce:transition-none"
          >
            <ComposerAttachments />
            {/* 官方 Lexical 富文本输入:/命令 渲染为原生内联 chip(可整体选中/删除/撤销) */}
            <LexicalComposerInput
              placeholder={t("placeholder")}
              className="aui-composer-lexical max-h-64 min-h-[4.25rem] w-full overflow-y-auto px-2.5 py-2 text-base leading-7 outline-none"
              autoFocus
              aria-label="Message input"
              formatter={slashDirectiveFormatter}
              directiveChip={LexicalSlashChip}
              directivePluginProps={{
                onDirectiveSelect: insertSpaceAfterSelectedDirective,
              }}
              onKeyDown={inputHistory.onKeyDown}
            >
              {/* chip 插入末尾时补尾随空格,光标不贴边;
                  建议 chip 外部插入桥(ThreadSuggestions 点击填入) */}
              <ChipSpacingPlugin />
              <ComposerSuggestionBridge />
              <ComposerPastePlugin />
            </LexicalComposerInput>
            <ComposerAction />
          </div>
        </ComposerPrimitive.AttachmentDropzone>
      </ComposerPrimitive.Root>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  );
};

const ComposerAction: FC = () => {
  const t = useTranslations("thread");
  return (
    <div className="aui-composer-action-wrapper relative flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <ComposerAddAttachment />
        <DeepThinkingToggle />
      </div>
      <div className="flex items-center gap-1.5">
        <AuiIf condition={(s) => s.thread.capabilities.dictation}>
          <AuiIf condition={(s) => s.composer.dictation == null}>
            <ComposerPrimitive.Dictate asChild>
              <TooltipIconButton
                tooltip={t("voiceInput")}
                side="bottom"
                type="button"
                variant="ghost"
                size="icon"
                className="aui-composer-dictate text-muted-foreground hover:text-foreground size-7 rounded-full"
                aria-label={t("voiceInput")}
              >
                <MicIcon className="aui-composer-dictate-icon size-4" />
              </TooltipIconButton>
            </ComposerPrimitive.Dictate>
          </AuiIf>
          <AuiIf condition={(s) => s.composer.dictation != null}>
            <ComposerPrimitive.StopDictation asChild>
              <TooltipIconButton
                tooltip={t("stopDictation")}
                side="bottom"
                type="button"
                variant="ghost"
                size="icon"
                className="aui-composer-stop-dictation text-destructive size-7 rounded-full"
                aria-label={t("stopDictation")}
              >
                <SquareIcon className="aui-composer-stop-dictation-icon size-3.5 animate-pulse fill-current" />
              </TooltipIconButton>
            </ComposerPrimitive.StopDictation>
          </AuiIf>
        </AuiIf>
        <AuiIf condition={(s) => !s.thread.isRunning}>
          <ComposerPrimitive.Send asChild>
            <TooltipIconButton
              tooltip={t("sendMessage")}
              side="bottom"
              type="button"
              variant="default"
              size="icon"
              className="aui-composer-send size-7 rounded-full"
              aria-label={t("sendMessage")}
            >
              <ArrowUpIcon className="aui-composer-send-icon size-4" />
            </TooltipIconButton>
          </ComposerPrimitive.Send>
        </AuiIf>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <ComposerPrimitive.Cancel asChild>
            <Button
              type="button"
              variant="default"
              size="icon"
              className="aui-composer-cancel size-7 rounded-full"
              aria-label={t("stopGenerating")}
            >
              <SquareIcon className="aui-composer-cancel-icon size-3.5 fill-current" />
            </Button>
          </ComposerPrimitive.Cancel>
        </AuiIf>
      </div>
    </div>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root border-destructive bg-destructive/10 text-destructive dark:bg-destructive/5 mt-2 rounded-md border p-3 text-sm dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

/**
 * 运行中的状态文案：优先提示正在执行的工具；否则在尚未产出可见文本（含
 * reasoning token 流式阶段）时显示「深度思考中」；一旦有可见文本即返回
 * undefined，让 ThinkingIndicator 退场。
 */
function useThinkingLabel() {
  const [deepThinking, setDeepThinking] = useState(false);

  useEffect(() => {
    const sync = () => setDeepThinking(getClientRuntimeContext().deepThinking === true);
    sync();
    window.addEventListener(RUNTIME_CONTEXT_UPDATED_EVENT, sync);
    return () => window.removeEventListener(RUNTIME_CONTEXT_UPDATED_EVENT, sync);
  }, []);

  return useAuiState((s) => {
    if (s.message.status?.type !== "running") return undefined;
    const pending = s.message.parts.find((p) => p.type === "tool-call" && p.result === undefined);
    if (pending?.type === "tool-call") return `调用 ${prettyToolName(pending.toolName)}`;
    const hasText = s.message.parts.some((p) => p.type === "text" && p.text.length > 0);
    return hasText ? undefined : deepThinking ? "深度思考中" : "生成中";
  });
}

function useElapsedLabel(active: boolean) {
  const [label, setLabel] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!active) {
      setLabel(undefined);
      return;
    }
    const start = Date.now();
    setLabel("0s");
    const id = setInterval(() => {
      setLabel(`${Math.round((Date.now() - start) / 1000)}s`);
    }, 1000);
    return () => clearInterval(id);
  }, [active]);
  return label;
}

const AssistantThinking: FC = () => {
  const label = useThinkingLabel();
  const elapsed = useElapsedLabel(label !== undefined);
  if (label === undefined) return null;
  return (
    <div className="aui-assistant-thinking mb-1.5">
      <ThinkingIndicator label={label} elapsed={elapsed} />
    </div>
  );
};

const ReasoningBlock: FC<{ text: string }> = ({ text }) => {
  const t = useTranslations("thread");
  if (!text) return null;
  return (
    <details
      className="aui-reasoning text-muted-foreground group my-2 rounded-xl border border-border/40 bg-muted/30 px-3.5 py-2.5 text-sm open:bg-muted/40"
      open
    >
      <summary className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-medium outline-none">
        <ChevronRightIcon className="size-3.5 transition-transform group-open:rotate-90" />
        {t("thinkingProcess")}
      </summary>
      <div className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed">{text}</div>
    </details>
  );
};

const AssistantMessage: FC = () => {
  const ACTION_BAR_PT = "pt-1.5";
  const ACTION_BAR_HEIGHT = `min-h-7.5 ${ACTION_BAR_PT}`;
  const msgId = useAuiState((s) => s.message.id);

  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      data-role="assistant"
      id={`aui-msg-${msgId}`}
      className="fade-in slide-in-from-bottom-1 animate-in relative -mb-7.5 pb-7.5 duration-150 [contain-intrinsic-size:auto_200px] [content-visibility:auto]"
    >
      <div
        data-slot="aui_assistant-message-content"
        className="text-foreground flex flex-col px-2 leading-relaxed wrap-break-word"
      >
        <AssistantThinking />
        <MessagePrimitive.Parts>
          {({ part }) => {
            if (part.type === "reasoning") return <ReasoningBlock text={part.text} />;
            if (part.type === "text") return <StreamdownText />;
            if (part.type === "tool-call") {
              // 文件生成工具族:专用渲染器(生成中/完成的文档 tile + 预览/下载)。
              // parts 按时间序渲染而工具先于文本完成,卡片会插在回复中间;
              // order-last 让其固定展示在全部文本之后(先说明后交付)
              if (
                part.toolName === "generate_document" ||
                part.toolName === "generate_spreadsheet" ||
                part.toolName === "generate_presentation"
              )
                return (
                  <div className="order-last">
                    <GenerateDocumentResult args={part.args} result={part.result ?? null} />
                  </div>
                );
              return part.toolUI ?? <ToolFallback {...part} />;
            }
            // 模型返回的附件:图片内联展示,其他文件渲染为可下载 tile
            if (part.type === "file")
              return (
                <AssistantAttachment
                  data={part.data}
                  mimeType={part.mimeType}
                  filename={part.filename}
                />
              );
            if (part.type === "image")
              return (
                <AssistantAttachment
                  image={part.image}
                  filename={part.filename}
                  mimeType="image/*"
                />
              );
            return null;
          }}
        </MessagePrimitive.Parts>
        <MessageError />
      </div>
      <div
        data-slot="aui_assistant-message-footer"
        className={cn("ms-2 flex items-center", ACTION_BAR_HEIGHT)}
      >
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  const t = useTranslations("thread");
  const awaitingPlanQuestions = useAuiState((s) =>
    s.message.parts.some(
      (part) =>
        part.type === "tool-call" &&
        part.toolName === "ask_plan_questions" &&
        part.result === undefined,
    ),
  );

  // 人工确认卡片等待用户输入时，消息尚未真正完成，隐藏复制/重试/反馈等操作。
  if (awaitingPlanQuestions) return null;

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-assistant-action-bar-root text-muted-foreground animate-in fade-in col-start-3 row-start-2 -ms-1 flex gap-1 duration-200"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip={t("copy")}>
          <AuiIf condition={(s) => s.message.isCopied}>
            <CheckIcon className="animate-in zoom-in-50 fade-in duration-200 ease-out" />
          </AuiIf>
          <AuiIf condition={(s) => !s.message.isCopied}>
            <CopyIcon className="animate-in zoom-in-75 fade-in duration-150" />
          </AuiIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip={t("refresh")}>
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
      {/* 消息反馈:提交后图标高亮(data-submitted) */}
      <ActionBarPrimitive.FeedbackPositive asChild aria-label={t("feedbackPositive")}>
        <TooltipIconButton
          tooltip={t("feedbackPositive")}
          className="data-[submitted=true]:text-primary"
        >
          <ThumbsUpIcon className="size-4" />
        </TooltipIconButton>
      </ActionBarPrimitive.FeedbackPositive>
      <ActionBarPrimitive.FeedbackNegative asChild aria-label={t("feedbackNegative")}>
        <TooltipIconButton
          tooltip={t("feedbackNegative")}
          className="data-[submitted=true]:text-destructive"
        >
          <ThumbsDownIcon className="size-4" />
        </TooltipIconButton>
      </ActionBarPrimitive.FeedbackNegative>
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger asChild>
          <TooltipIconButton tooltip={t("more")} className="data-[state=open]:bg-accent">
            <MoreHorizontalIcon />
          </TooltipIconButton>
        </ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="aui-action-bar-more-content bg-popover/95 text-popover-foreground data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-32 overflow-hidden rounded-xl border p-1.5 shadow-lg backdrop-blur-sm"
        >
          <ActionBarPrimitive.ExportMarkdown asChild>
            <ActionBarMorePrimitive.Item className="aui-action-bar-more-item hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none">
              <DownloadIcon className="size-4" />
              {t("exportMarkdown")}
            </ActionBarMorePrimitive.Item>
          </ActionBarPrimitive.ExportMarkdown>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  const msgId = useAuiState((s) => s.message.id);
  return (
    <MessagePrimitive.Root
      data-slot="aui_user-message-root"
      id={`aui-msg-${msgId}`}
      className="fade-in slide-in-from-bottom-1 animate-in grid auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 duration-150 [contain-intrinsic-size:auto_200px] [content-visibility:auto] [&:where(>*)]:col-start-2"
      data-role="user"
    >
      <UserMessageAttachments />

      <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
        <div className="aui-user-message-content peer bg-primary/10 text-foreground border border-primary/15 dark:border-primary/20 rounded-2xl px-4 py-2.5 shadow-sm wrap-break-word empty:hidden">
          {/* Text 组件将 "/命令" 渲染为技能/MCP chip */}
          <MessagePrimitive.Parts components={{ Text: UserMessageText }} />
        </div>
        <div className="aui-user-action-bar-wrapper absolute inset-s-0 top-1/2 -translate-x-full -translate-y-1/2 pe-2 peer-empty:hidden rtl:translate-x-full">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker
        data-slot="aui_user-branch-picker"
        className="col-span-full col-start-1 row-start-3 -me-1 justify-end"
      />
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  const t = useTranslations("thread");

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip={t("editMessage")} className="aui-user-action-edit">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  const t = useTranslations("thread");
  return (
    <MessagePrimitive.Root
      data-slot="aui_edit-composer-wrapper"
      className="flex flex-col px-2 [contain-intrinsic-size:auto_200px] [content-visibility:auto]"
    >
      <ComposerPrimitive.Root className="aui-edit-composer-root border-border/60 dark:border-muted-foreground/15 ms-auto flex w-full max-w-[85%] cursor-text flex-col rounded-(--composer-radius) border bg-(--composer-bg) shadow-[0_4px_16px_-8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none">
        <ComposerPrimitive.Input
          className="aui-edit-composer-input text-foreground min-h-14 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base outline-none"
          autoFocus
        />
        <div className="aui-edit-composer-footer mx-2.5 mb-2.5 flex items-center gap-1.5 self-end">
          <ComposerPrimitive.Cancel asChild>
            <Button variant="ghost" size="sm" className="h-8 rounded-full px-3.5">
              {t("cancel")}
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm" className="h-8 rounded-full px-3.5">
              {t("updateMessage")}
            </Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({ className, ...rest }) => {
  const t = useTranslations("thread");

  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "aui-branch-picker-root text-muted-foreground -ms-2 me-2 inline-flex items-center text-xs",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip={t("previous")}>
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip={t("next")}>
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
import { useTranslations } from "next-intl";
