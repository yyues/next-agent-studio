"use client";

import { useState, type FC } from "react";
import { useTranslations } from "next-intl";
import { DownloadIcon, EyeIcon, FileText, Loader2Icon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type GenDocArgs = {
  filename?: string;
  content?: string;
  /** xlsx/pptx 工具的结构化数据(预览兜底展示) */
  sheets?: unknown;
  slides?: unknown;
};

type GenDocResult = {
  url?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
};

function formatSize(size?: number): string {
  if (!size || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/** 预览文本:md/txt 用原文;xlsx/pptx 展示结构化数据 JSON */
function previewTextOf(args: GenDocArgs): string {
  if (args.content) return args.content;
  if (args.sheets ?? args.slides)
    return JSON.stringify(
      (args.sheets ?? args.slides) as unknown,
      null,
      2,
    );
  return "";
}

/**
 * generate_document 工具的消息内渲染器:
 * 生成中显示加载 tile;完成后显示文档卡片(文件名/大小 + 预览 + 下载)。
 * 工具结果随 tool-call part 持久化,刷新会话后依然可预览/下载。
 */
export const GenerateDocumentResult: FC<{
  args: GenDocArgs;
  result: GenDocResult | null;
}> = ({ args, result }) => {
  const t = useTranslations("thread");
  const [previewOpen, setPreviewOpen] = useState(false);

  const filename = result?.filename ?? args.filename ?? "document.md";
  const size = formatSize(result?.size ?? args.content?.length);
  const previewText = previewTextOf(args);

  if (!result) {
    return (
      <div className="border-border/60 bg-card my-1 inline-flex items-center gap-2.5 rounded-xl border px-3 py-2.5">
        <span className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg">
          <Loader2Icon className="size-4 animate-spin" />
        </span>
        <span className="text-muted-foreground truncate text-sm">
          {t("genDocGenerating")}
          <span className="text-foreground/70 ml-1 font-mono text-xs">
            {filename}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className="my-1.5">
      <div className="border-border/60 bg-card aui-lift flex max-w-md items-center gap-2.5 rounded-xl border px-3 py-2.5">
        <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
          <FileText className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {filename}
          </span>
          <span className="text-muted-foreground block text-xs">
            {t("genDocTitle")}
            {size ? ` · ${size}` : ""}
          </span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2.5 text-xs"
          onClick={() => setPreviewOpen(true)}
          disabled={!previewText}
        >
          <EyeIcon className="size-3.5" />
          {t("genDocPreview")}
        </Button>
        <a
          href={result.url}
          download={filename}
          className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors"
        >
          <DownloadIcon className="size-3.5" />
          {t("genDocDownload")}
        </a>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate text-base">
              {filename}
            </DialogTitle>
            <DialogDescription>{t("genDocTitle")}</DialogDescription>
          </DialogHeader>
          <pre className="bg-muted/50 max-h-[60vh] overflow-auto rounded-lg p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {previewText}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
};
