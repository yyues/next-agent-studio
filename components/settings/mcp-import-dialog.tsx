"use client";

import { useEffect, useMemo, useState, type FC } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, FileJsonIcon, Loader2Icon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  parseMcpServersJson,
  type McpImportEntry,
} from "@/lib/mcp/import";

/**
 * mcpServers JSON 粘贴导入弹窗(角色设置与全局管理共用):
 * - 粘贴标准配置实时解析预览(url 直连 / mcp-remote 提取 / 跳过项及原因)
 * - save 由调用方注入(角色端 POST /api/settings/roles/[roleId]/mcp,
 *   管理端 POST /api/admin/mcp,均为 upsert),逐条导入、逐条报错
 */

type ImportOutcome = { name: string; ok: boolean; error?: string };

type McpImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  save: (entry: McpImportEntry) => Promise<void>;
  onImported?: () => void | Promise<void>;
};

const SKIP_REASON_KEY: Record<string, string> = {
  "invalid-def": "mcpImportSkipInvalid",
};

const PARSE_ERROR_KEY: Record<string, string> = {
  "invalid-json": "mcpImportInvalidJson",
  "no-mcp-servers": "mcpImportNoWrapper",
};

/** 预览行展示的连接串:URL 型显示 URL,stdio 型显示 命令+参数 */
const entryDisplay = (entry: {
  url: string;
  command: string;
  args: string[];
}) =>
  entry.command
    ? [entry.command, ...entry.args].filter(Boolean).join(" ")
    : entry.url;

export const McpImportDialog: FC<McpImportDialogProps> = ({
  open,
  onOpenChange,
  save,
  onImported,
}) => {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const [outcomes, setOutcomes] = useState<ImportOutcome[] | null>(null);

  // 每次打开重置,避免残留上次的粘贴与结果
  useEffect(() => {
    if (open) {
      setText("");
      setOutcomes(null);
      setImporting(false);
    }
  }, [open]);

  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    try {
      return parseMcpServersJson(text);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "invalid-json" };
    }
  }, [text]);

  const parseErrorKey =
    parsed && "error" in parsed
      ? (PARSE_ERROR_KEY[parsed.error] ?? "mcpImportInvalidJson")
      : null;
  const entries = parsed && "entries" in parsed ? parsed.entries : [];
  const skipped = parsed && "skipped" in parsed ? parsed.skipped : [];

  const okCount = outcomes?.filter((o) => o.ok).length ?? 0;
  const failCount = outcomes ? outcomes.length - okCount : 0;

  const handleImport = async () => {
    if (entries.length === 0 || importing) return;
    setImporting(true);
    setOutcomes(null);
    const results: ImportOutcome[] = [];
    for (const entry of entries) {
      try {
        await save(entry);
        results.push({ name: entry.name, ok: true });
      } catch (e) {
        results.push({
          name: entry.name,
          ok: false,
          error: e instanceof Error ? e.message : "",
        });
      }
    }
    setOutcomes(results);
    setImporting(false);
    if (results.some((r) => r.ok)) await onImported?.();
    // 全部成功则直接收起,失败项留在弹窗里展示
    if (results.every((r) => r.ok)) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJsonIcon className="text-chart-2 size-4" />
            {t("mcpImportTitle")}
          </DialogTitle>
          <DialogDescription>{t("mcpImportDesc")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <textarea
            value={text}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setText(e.target.value);
              setOutcomes(null);
            }}
            placeholder={t("mcpImportPlaceholder")}
            className="bg-background border-input focus-visible:border-primary focus-visible:ring-primary/30 min-h-32 rounded-md border px-2.5 py-2 font-mono text-xs outline-none focus-visible:ring-2"
            rows={7}
          />

          {parseErrorKey && (
            <p className="text-destructive text-xs">{t(parseErrorKey)}</p>
          )}

          {entries.length > 0 && (
            <div className="grid gap-1.5">
              {entries.map((entry) => (
                <div
                  key={entry.name}
                  className="border-border/40 flex items-start gap-2 rounded-md border px-2.5 py-2"
                >
                  <CheckIcon className="text-emerald-500 mt-0.5 size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{entry.name}</span>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px]",
                          entry.origin === "stdio"
                            ? "bg-violet-500/10 text-violet-600 dark:text-violet-400"
                            : entry.origin === "mcp-remote"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {t(
                          entry.origin === "stdio"
                            ? "mcpImportOriginStdio"
                            : entry.origin === "mcp-remote"
                              ? "mcpImportOriginRemote"
                              : "mcpImportOriginUrl",
                        )}
                      </span>
                    </span>
                    <span className="text-muted-foreground mt-0.5 block truncate font-mono text-xs">
                      {entryDisplay(entry)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {skipped.length > 0 && (
            <div className="grid gap-1.5">
              <p className="text-muted-foreground text-xs">
                {t("mcpImportSkippedTitle", { count: skipped.length })}
              </p>
              {skipped.map((item) => (
                <div
                  key={item.name}
                  className="border-border/40 flex items-start gap-2 rounded-md border px-2.5 py-2"
                >
                  <XCircleIcon className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{item.name}</span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {t(SKIP_REASON_KEY[item.reason] ?? "mcpImportSkipInvalid")}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {parsed && !parseErrorKey && entries.length === 0 && (
            <p className="text-muted-foreground text-xs">
              {t("mcpImportNoEntries")}
            </p>
          )}

          {outcomes && failCount > 0 && (
            <div className="grid gap-1">
              <p
                className={cn(
                  "text-xs",
                  okCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-destructive",
                )}
              >
                {t("mcpImportPartial", { ok: okCount, fail: failCount })}
              </p>
              {outcomes
                .filter((o) => !o.ok)
                .map((o) => (
                  <p key={o.name} className="text-destructive text-xs">
                    {t("mcpImportEntryFailed", { name: o.name })}
                    {o.error && `: ${o.error}`}
                  </p>
                ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={() => void handleImport()}
            disabled={importing || entries.length === 0}
            className="gap-1.5"
          >
            {importing && <Loader2Icon className="size-3.5 animate-spin" />}
            {importing
              ? t("mcpImportImporting")
              : t("mcpImportButton", { count: entries.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
