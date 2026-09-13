"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FC,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { ComposerPrimitive } from "@assistant-ui/react";
import {
  getClientRuntimeContext,
  RUNTIME_CONTEXT_UPDATED_EVENT,
} from "@/lib/client-runtime-context";
import { useCommandRegistry, type CommandEntry } from "@/lib/command-registry";
import { slashDirectiveFormatter } from "@/lib/slash-directive";
import { CommandChip } from "@/components/assistant-ui/command-chip";
import { cn } from "@/lib/utils";
import { Loader2Icon, PlugZapIcon, SparklesIcon } from "lucide-react";

type SlashItem = {
  id: string;
  type: "skill" | "mcp";
  label: string;
  description: string;
  metadata: { name: string; kind: string };
};

/** registry 条目 → TriggerItem(label = 命令名,chip 直接显示) */
function toItems(commands: CommandEntry[]): SlashItem[] {
  return commands.map((c) => ({
    id: `${c.type}:${c.id}`,
    type: c.type,
    label: c.name,
    description: c.description,
    metadata: { name: c.name, kind: c.type },
  }));
}

/**
 * "/" 命令面板(Slack/Discord 式):
 * - 输入 / 弹出当前角色的 技能 + MCP 服务器,继续输入即过滤
 * - 选中插入 /名称 (Directive 行为,自定义 formatter)
 * - ↑↓ 导航 / Enter 选中 / Esc 关闭、ARIA combobox 均由原语内置
 * 输入框本体使用官方 LexicalComposerInput(react-lexical),
 * 选中命令渲染为原生内联 chip(见 LexicalSlashChip)。
 */
export const ComposerSlash: FC = () => {
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

  // 无 categories → 空查询也走 search() 平铺全部;渲染层按 type 视觉分组
  const adapter = useMemo(
    () => ({
      categories: () => [],
      categoryItems: () => [],
      search: (query: string) => {
        const lower = query.trim().toLowerCase();
        if (!lower) return toItems(commands);
        return toItems(
          commands.filter(
            (c) =>
              c.name.toLowerCase().includes(lower) ||
              c.label.toLowerCase().includes(lower) ||
              c.description.toLowerCase().includes(lower),
          ),
        );
      },
    }),
    [commands],
  );

  if (!roleId) return null;

  return (
    <ComposerPrimitive.Unstable_TriggerPopover
      char="/"
      adapter={adapter}
      isLoading={loading}
      className="bg-popover text-popover-foreground border-border animate-in fade-in slide-in-from-bottom-1 absolute bottom-full left-0 z-40 mb-2 max-h-72 w-80 overflow-y-auto rounded-xl border p-1.5 shadow-lg duration-150 motion-reduce:animate-none"
      aria-label={t("slashLabel")}
    >
      <ComposerPrimitive.Unstable_TriggerPopover.Directive
        formatter={slashDirectiveFormatter}
      />
      <ComposerPrimitive.Unstable_TriggerPopoverItems>
        {(items) => (
          <SlashList
            items={items as SlashItem[]}
            loading={loading && items.length === 0}
          />
        )}
      </ComposerPrimitive.Unstable_TriggerPopoverItems>
    </ComposerPrimitive.Unstable_TriggerPopover>
  );
};

/**
 * LexicalComposerInput 的内联命令 chip:
 * 复用对话历史的 CommandChip 样式(技能主色/MCP teal,图标+配色双区分)。
 * 附加逻辑边距:与光标及前后文字留出呼吸间隙,不紧贴。
 */
export const LexicalSlashChip: FC<{
  directiveId: string;
  directiveType: string;
  label: string;
}> = ({ directiveType, label }) => (
  <CommandChip
    type={directiveType === "mcp" ? "mcp" : "skill"}
    label={label}
    variant="history"
  />
);

const SlashList: FC<{ items: SlashItem[]; loading: boolean }> = ({
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
        {t("slashEmpty")}
      </p>
    );
  }

  const skills = items.filter((i) => i.type === "skill");
  const mcps = items.filter((i) => i.type === "mcp");

  const group = (
    key: string,
    title: string,
    icon: ReactNode,
    groupItems: SlashItem[],
    startIndex: number,
  ) =>
    groupItems.length > 0 && (
      <div key={key} className="mb-1.5 last:mb-0">
        <p className="text-muted-foreground flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium tracking-wide">
          {icon}
          {title}
        </p>
        {groupItems.map((item, i) => (
          <ComposerPrimitive.Unstable_TriggerPopoverItem
            key={item.id}
            item={item}
            index={startIndex + i}
            className="data-highlighted:bg-accent flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors"
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-md",
                item.type === "skill"
                  ? "bg-primary/10 text-primary"
                  : "bg-chart-2/15 text-chart-2",
              )}
            >
              {item.type === "skill" ? (
                <SparklesIcon className="size-3.5" />
              ) : (
                <PlugZapIcon className="size-3.5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                <span className="text-muted-foreground">/</span>
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

  return (
    <>
      {group(
        "skill",
        t("slashSkills"),
        <SparklesIcon className="size-3" key="i" />,
        skills,
        0,
      )}
      {group(
        "mcp",
        t("slashMcp"),
        <PlugZapIcon className="size-3" key="i" />,
        mcps,
        skills.length,
      )}
    </>
  );
};
