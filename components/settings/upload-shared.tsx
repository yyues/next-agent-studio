"use client";

import { useRef, type FC } from "react";
import { Loader2Icon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 上传交互的共享部件(角色详情与全局库维护页共用):
 * XHR 进度上传 + 结构化拒绝 + 进度条 + 文件选择按钮。
 */

export type UploadPhase = "transferring" | "processing";

export type UploadState = {
  kind: "skill" | "resource";
  fileName: string;
  percent: number;
  phase: UploadPhase;
};

/** 服务端结构化拒绝(DUPLICATE_CONTENT / SKILL_ID_EXISTS / RESOURCE_EXISTS) */
export class UploadRejected extends Error {
  code: string;
  existing?: {
    title?: string;
    version?: string;
    fileName?: string;
  };
  constructor(
    code: string,
    existing?: { title?: string; version?: string; fileName?: string },
  ) {
    super(code);
    this.code = code;
    this.existing = existing;
  }
}

/** XHR 上传:fetch 拿不到 upload progress,用 xhr.upload.onprogress 回传字节百分比 */
export function uploadFileWithProgress(
  url: string,
  file: File,
  onProgress: (percent: number, phase: UploadPhase) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(
          Math.round((e.loaded / e.total) * 100),
          "transferring",
        );
      }
    };
    xhr.upload.onload = () => onProgress(100, "processing");
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      const body = (xhr.response ?? {}) as {
        error?: string;
        existing?: { title?: string; version?: string; fileName?: string };
      };
      reject(new UploadRejected(body.error ?? `HTTP ${xhr.status}`, body.existing));
    };
    xhr.onerror = () => reject(new Error("Network error"));
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}

/** 上传进度行:文件名 + 百分比/处理中 + 进度条(处理阶段满格脉冲提示仍在服务端处理) */
export const UploadProgress: FC<{
  upload: UploadState;
  t: (key: string) => string;
}> = ({ upload, t }) => (
  <div className="border-border/40 mb-3 rounded-md border px-3 py-2.5">
    <div className="flex items-center gap-2 text-xs">
      <Loader2Icon className="text-primary size-3.5 shrink-0 animate-spin" />
      <span className="min-w-0 flex-1 truncate font-medium">
        {upload.fileName}
      </span>
      <span className="text-muted-foreground shrink-0 tabular-nums">
        {upload.phase === "transferring" ? `${upload.percent}%` : t("processing")}
      </span>
    </div>
    <div className="bg-muted mt-2 h-1.5 w-full overflow-hidden rounded-full">
      <div
        className={cn(
          "bg-primary h-full rounded-full transition-[width] duration-200",
          upload.phase === "processing" && "animate-pulse",
        )}
        style={{ width: `${upload.percent}%` }}
      />
    </div>
  </div>
);

export const FilePickerButton: FC<{
  accept: string;
  onSelect: (file: File) => void;
  label: string;
  disabled?: boolean;
  busy?: boolean;
}> = ({ accept, onSelect, label, disabled, busy }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelect(file);
          e.target.value = "";
        }}
      />
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <UploadIcon className="size-3.5" />
        )}
        {label}
      </Button>
    </>
  );
};
