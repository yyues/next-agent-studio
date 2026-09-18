"use client";

import { useEffect, useMemo, useState, type FC } from "react";
import { useTranslations } from "next-intl";
import { ComposerPrimitive } from "@assistant-ui/react";
import {
  getClientRuntimeContext,
  RUNTIME_CONTEXT_UPDATED_EVENT,
} from "@/lib/client-runtime-context";
import { useCommandRegistry } from "@/lib/command-registry";
import { mentionDirectiveFormatter } from "@/lib/slash-directive";
import { Loader2Icon, PlugZapIcon } from "lucide-react";

type MentionItem = {
  id: string;
  type: "mention";
  label: string;
  description: string;
  metadata: { name: string; kind: string };
};

/**
 * "@" 提及面板:输入 @ 弹出当前角色的 MCP 服务器,选中插入 `@名称 ` chip。
 * 与 "/" 命令面板共用 TriggerPopoverRoot(按 char 注册,互不冲突);
 * 序列化文本由后端 extractMcpMentions 解析,强制启用被提及的 server。
 * 角色未配置 MCP 时不注册触发符(输入 @ 无面板)。
 */
export const ComposerMention: FC = () => {
  const t = useTranslations("thread");
  const [roleId, setRoleId] = useState(() => getClientRuntimeContext().roleId);
  const commands = useCommandRegistry((s) => s.commands);
  const loading = useCommandRegistry((s) => s.loading);
  const ensureLoaded = useCommandRegistry((s) => s.ensureLoaded);

  // 角色切换/初载时拉取该角色的命令表(ensureLoaded 内部按 roleId 去重)
  useEffect(() => {
    const sync = () => {
      const next = getClientRuntimeContext().roleId;
      setRoleId(next);
      ensureLoaded(next);
    };
    sync();
    window.addEventListener(RUNTIME_CONTEXT_UPDATED_EVENT, sync);
    return () =>
      window.removeEventListener(RUNTIME_CONTEXT_UPDATED_EVENT, sync);
  }, [ensureLoaded]);

  const mcps = useMemo(
    () => commands.filter((c) => c.type === "mcp"),
    [commands],
  );

  const adapter = useMemo(
    () => ({
      categories: () => [],
      categoryItems: () => [],
      search: (query: string) => {
        const lower = query.trim().toLowerCase();
        const matched = lower
          ? mcps.filter(
              (c) =>
                c.name.toLowerCase().includes(lower) ||
                c.label.toLowerCase().includes(lower) ||
                c.description.toLowerCase().includes(lower),
            )
          : mcps;
        return matched.map((c) => ({
          id: `mention:${c.id}`,
          type: "mention" as const,
          label: c.name,
          description: c.description,
          metadata: { name: c.name, kind: "mcp" },
        }));
      },
    }),
    [mcps],
  );

  if (!roleId) return null;
  // 无 MCP server 且加载完成时不注册 @ 触发符
  if (!loading && mcps.length === 0) return null;

  return (
    <ComposerPrimitive.Unstable_TriggerPopover
      char="@"
      adapter={adapter}
      isLoading={loading}
      className="bg-popover text-popover-foreground border-border animate-in fade-in slide-in-from-bottom-1 absolute bottom-full left-0 z-40 mb-2 max-h-72 w-80 overflow-y-auto rounded-xl border p-1.5 shadow-lg duration-150 motion-reduce:animate-none"
      aria-label={t("mentionLabel")}
    >
      <ComposerPrimitive.Unstable_TriggerPopover.Directive
        formatter={mentionDirectiveFormatter}
      />
      <ComposerPrimitive.Unstable_TriggerPopoverItems>
        {(items) => (
          <MentionList
            items={items as MentionItem[]}
            loading={loading && items.length === 0}
          />
        )}
      </ComposerPrimitive.Unstable_TriggerPopoverItems>
    </ComposerPrimitive.Unstable_TriggerPopover>
  );
};

const MentionList: FC<{ items: MentionItem[]; loading: boolean }> = ({
  items,
  loading,
}) => {
  const t = useTranslations("thread");

  if (loading) {
    return (
      <p className="text-muted-foreground flex items-center justify-center gap-1.5 px-3 py-6 text-xs">
        <Loader2Icon className="size-3 animate-spin" />
        {t("slashLoading")}
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground px-3 py-6 text-center text-xs">
        {t("mentionEmpty")}
      </p>
    );
  }

  return (
    <div className="mb-1.5 last:mb-0">
      <p className="text-muted-foreground flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium tracking-wide">
        <PlugZapIcon className="size-3" />
        {t("slashMcp")}
      </p>
      {items.map((item, i) => (
        <ComposerPrimitive.Unstable_TriggerPopoverItem
          key={item.id}
          item={item}
          index={i}
          className="data-highlighted:bg-accent flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors"
        >
          <span className="bg-chart-2/15 text-chart-2 flex size-6 shrink-0 items-center justify-center rounded-md">
            <PlugZapIcon className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">
              <span className="text-muted-foreground">@</span>
              {item.metadata.name}
            </span>
            {item.description && (
              <span className="text-muted-foreground block truncate text-xs">
                {item.description}
              </span>
            )}
          </span>
        </ComposerPrimitive.Unstable_TriggerPopoverItem>
      ))}
    </div>
  );
};
