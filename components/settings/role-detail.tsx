"use client";

import { useCallback, useEffect, useRef, useState, type FC } from "react";
import { useTranslations } from "next-intl";
import { getClientRuntimeContext } from "@/lib/client-runtime-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeftIcon,
  Trash2Icon,
  UploadIcon,
  ShieldCheckIcon,
  UserIcon,
  CheckIcon,
  Loader2Icon,
  AlertCircleIcon,
  PlusIcon,
  PencilIcon,
} from "lucide-react";

/* ---------- types ---------- */

type SkillInfo = {
  skillId: string;
  title: string;
  description: string;
  version?: string;
};

type ResourceInfo = {
  resourceId: string;
  fileName: string;
  filePath: string;
  createdAt?: string;
};

type McpServerInfo = {
  serverId: string;
  name: string;
  url: string;
  enabled: boolean;
  headerKeys: string[];
};

type RoleDetail = {
  role: {
    roleId: string;
    displayName: string;
    description: string;
    enabled: boolean;
    systemPrompt: string;
    skillIds: string[];
    priority: number;
    suggestions: string[];
  };
  skills: SkillInfo[];
  resources: ResourceInfo[];
};

/* ---------- builtin set(与 lib/server-settings 的 defaultRoleProfiles 保持一致) ---------- */

const builtinRoleIds = new Set(["general", "developer"]);

/* ---------- upload ---------- */

type UploadPhase = "transferring" | "processing";

type UploadState = {
  kind: "skill" | "resource";
  fileName: string;
  percent: number;
  phase: UploadPhase;
};

/** 服务端结构化拒绝(DUPLICATE_CONTENT / SKILL_ID_EXISTS / RESOURCE_EXISTS) */
class UploadRejected extends Error {
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
function uploadFileWithProgress(
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

/* ---------- component ---------- */

export type RoleDetailProps = {
  /** 当前编辑的角色 id(由工作区左栏选中驱动) */
  roleId: string;
  /** 角色被删除后回调(工作区清空选中并刷新列表) */
  onDeleted?: () => void;
  /** 移动端"返回列表"(桌面双栏常驻,不渲染) */
  onMobileBack?: () => void;
};

export const RoleDetail: FC<RoleDetailProps> = ({
  roleId,
  onDeleted,
  onMobileBack,
}) => {
  const t = useTranslations("roles");
  const tc = useTranslations("common");

  const [detail, setDetail] = useState<RoleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /* auto-save state */
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* form fields */
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [priority, setPriority] = useState(0);
  const [suggestions, setSuggestions] = useState("");

  /* delete dialog */
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSkillTarget, setDeleteSkillTarget] = useState<SkillInfo | null>(
    null,
  );
  const [deleteResourceTarget, setDeleteResourceTarget] =
    useState<ResourceInfo | null>(null);
  /* 删除请求进行中:确认按钮 loading,防重复提交;
   * ref 提供同帧级同步守卫,避免连续 Enter/双击在 state 异步更新前穿透 */
  const [deleteBusy, setDeleteBusy] = useState(false);
  const deleteBusyRef = useRef(false);

  const beginDelete = () => {
    if (deleteBusyRef.current) return false;
    deleteBusyRef.current = true;
    setDeleteBusy(true);
    return true;
  };
  const endDelete = () => {
    deleteBusyRef.current = false;
    setDeleteBusy(false);
  };

  /* mcp state */
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);
  const [mcpDialogOpen, setMcpDialogOpen] = useState(false);
  const [mcpEditing, setMcpEditing] = useState<McpServerInfo | null>(null);
  const [mcpForm, setMcpForm] = useState({ name: "", url: "", headers: "" });
  const [mcpTesting, setMcpTesting] = useState(false);
  const [mcpTestResult, setMcpTestResult] = useState("");

  /* upload state */
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [uploadNotice, setUploadNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [overwriteTarget, setOverwriteTarget] = useState<{
    kind: "skill" | "resource";
    file: File;
    name: string;
  } | null>(null);

  const isBuiltin = builtinRoleIds.has(roleId);

  /* ----- data loading ----- */

  const loadDetail = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    // silent:已有数据时静默刷新,不把页面闪回全屏 loading
    if (!silent) setLoading(true);
    setError("");
    try {
      const userId = getClientRuntimeContext().userId;
      const res = await fetch(
        `/api/settings/roles/${encodeURIComponent(roleId)}?userId=${encodeURIComponent(userId)}`,
      );
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || "Failed to load role");
      }
      const data = (await res.json()) as RoleDetail;
      setDetail(data);
      setDisplayName(data.role.displayName);
      setDescription(data.role.description ?? "");
      setSystemPrompt(data.role.systemPrompt);
      setEnabled(data.role.enabled);
      setPriority(data.role.priority);
      setSuggestions((data.role.suggestions ?? []).join("\n"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [roleId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  /* ----- auto-save ----- */

  const saveFields = useCallback(
    async (fields: Record<string, unknown>) => {
      setSaveStatus("saving");
      try {
        const userId = getClientRuntimeContext().userId;
        const res = await fetch(
          `/api/settings/roles/${encodeURIComponent(roleId)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, ...fields }),
          },
        );
        if (!res.ok) throw new Error("save failed");
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch {
        setSaveStatus("error");
      }
    },
    [roleId],
  );

  const scheduleSave = useCallback(
    (fields: Record<string, unknown>) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void saveFields(fields);
      }, 800);
    },
    [saveFields],
  );

  /* ----- handlers ----- */

  const handleDeleteRole = async () => {
    if (!beginDelete()) return;
    try {
      const userId = getClientRuntimeContext().userId;
      const res = await fetch(
        `/api/settings/roles/${encodeURIComponent(roleId)}?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || t("deleteFailed"));
      }
      onDeleted?.();
    } catch {
      setError(t("deleteFailed"));
    } finally {
      endDelete();
    }
    setDeleteOpen(false);
  };

  /* ----- upload(技能与资源共用,带进度/去重/覆盖确认) ----- */

  const performUpload = useCallback(
    async (
      kind: "skill" | "resource",
      file: File,
      opts?: { overwrite?: boolean },
    ) => {
      const base =
        kind === "skill"
          ? `/api/settings/skills/${encodeURIComponent(roleId)}`
          : `/api/settings/roles/${encodeURIComponent(roleId)}/resources`;
      const url = opts?.overwrite ? `${base}?overwrite=true` : base;
      setUpload({ kind, fileName: file.name, percent: 0, phase: "transferring" });
      setUploadNotice(null);
      try {
        await uploadFileWithProgress(url, file, (percent, phase) =>
          setUpload((prev) => (prev ? { ...prev, percent, phase } : prev)),
        );
        setUploadNotice({ type: "success", text: t("uploadSuccess") });
        setTimeout(
          () => setUploadNotice((n) => (n?.type === "success" ? null : n)),
          4000,
        );
        await loadDetail({ silent: true });
      } catch (e) {
        if (e instanceof UploadRejected) {
          if (e.code === "DUPLICATE_CONTENT") {
            setUploadNotice({ type: "error", text: t("duplicateContent") });
          } else if (
            e.code === "SKILL_ID_EXISTS" ||
            e.code === "RESOURCE_EXISTS"
          ) {
            // 同名不同内容:弹确认,确认后带 overwrite 重传
            setOverwriteTarget({
              kind,
              file,
              name: e.existing?.title || e.existing?.fileName || file.name,
            });
          } else {
            setUploadNotice({ type: "error", text: e.message });
          }
        } else {
          setUploadNotice({
            type: "error",
            text: e instanceof Error ? e.message : t("saveFailed"),
          });
        }
      } finally {
        setUpload(null);
      }
    },
    [roleId, t, loadDetail],
  );

  const handleSkillUpload = (file: File) => {
    if (upload) return; // 上传进行中禁止重复触发
    void performUpload("skill", file);
  };

  const handleResourceUpload = (file: File) => {
    if (upload) return;
    void performUpload("resource", file);
  };

  const confirmOverwrite = () => {
    if (!overwriteTarget) return;
    const target = overwriteTarget;
    setOverwriteTarget(null);
    void performUpload(target.kind, target.file, { overwrite: true });
  };

  const handleSkillDelete = async (skillId: string) => {
    if (!beginDelete()) return;
    try {
      const res = await fetch(
        `/api/settings/skills/${encodeURIComponent(roleId)}/${encodeURIComponent(skillId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || t("deleteFailed"));
      }
      setDeleteSkillTarget(null);
      await loadDetail({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("deleteFailed"));
    } finally {
      endDelete();
    }
  };

  const handleResourceDelete = async (resourceId: string) => {
    if (!beginDelete()) return;
    try {
      const res = await fetch(
        `/api/settings/roles/${encodeURIComponent(roleId)}/resources/${encodeURIComponent(resourceId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || t("deleteFailed"));
      }
      setDeleteResourceTarget(null);
      await loadDetail({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("deleteFailed"));
    } finally {
      endDelete();
    }
  };

  /* ----- mcp handlers ----- */

  const loadMcpServers = useCallback(async () => {
    try {
      const userId = getClientRuntimeContext().userId;
      const res = await fetch(
        `/api/settings/roles/${encodeURIComponent(roleId)}/mcp?userId=${encodeURIComponent(userId)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { servers: McpServerInfo[] };
      setMcpServers(data.servers ?? []);
    } catch {
      // 列表加载失败保持空,不打断页面
    }
  }, [roleId]);

  useEffect(() => {
    void loadMcpServers();
  }, [loadMcpServers]);

  const openMcpDialog = (target: McpServerInfo | null) => {
    setMcpEditing(target);
    setMcpForm({
      name: target?.name ?? "",
      url: target?.url ?? "",
      headers: "",
    });
    setMcpTestResult("");
    setMcpDialogOpen(true);
  };

  /** headers 文本域按 "Key: Value" 每行一条解析 */
  const parseHeaders = (raw: string): Record<string, string> => {
    const headers: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const idx = line.indexOf(":");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key && value) headers[key] = value;
    }
    return headers;
  };

  const handleMcpSave = async () => {
    try {
      const userId = getClientRuntimeContext().userId;
      const res = await fetch(
        `/api/settings/roles/${encodeURIComponent(roleId)}/mcp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            serverId: mcpEditing?.serverId,
            name: mcpForm.name,
            url: mcpForm.url,
            headers: parseHeaders(mcpForm.headers),
          }),
        },
      );
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || t("saveFailed"));
      }
      setMcpDialogOpen(false);
      await loadMcpServers();
    } catch (e) {
      setMcpTestResult(e instanceof Error ? e.message : t("saveFailed"));
    }
  };

  const handleMcpTest = async () => {
    setMcpTesting(true);
    setMcpTestResult("");
    try {
      const res = await fetch(
        `/api/settings/roles/${encodeURIComponent(roleId)}/mcp`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: mcpForm.url,
            headers: parseHeaders(mcpForm.headers),
          }),
        },
      );
      const data = (await res.json()) as {
        toolNames?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "connection failed");
      setMcpTestResult(
        `OK - ${data.toolNames?.length ?? 0} tools: ${(data.toolNames ?? []).join(", ")}`,
      );
    } catch (e) {
      setMcpTestResult(e instanceof Error ? e.message : "connection failed");
    } finally {
      setMcpTesting(false);
    }
  };

  const handleMcpToggleEnabled = async (server: McpServerInfo) => {
    const userId = getClientRuntimeContext().userId;
    // enabled 切换通过 upsert 重新提交完整字段
    await fetch(`/api/settings/roles/${encodeURIComponent(roleId)}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        serverId: server.serverId,
        name: server.name,
        url: server.url,
        enabled: !server.enabled,
      }),
    });
    await loadMcpServers();
  };

  const handleMcpDelete = async (server: McpServerInfo) => {
    try {
      const userId = getClientRuntimeContext().userId;
      const res = await fetch(
        `/api/settings/roles/${encodeURIComponent(roleId)}/mcp/${encodeURIComponent(server.serverId)}?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || t("deleteFailed"));
      }
      await loadMcpServers();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("deleteFailed"));
    }
  };

  /* ----- render ----- */

  if (loading) {
    return (
      <div className="text-muted-foreground flex min-h-40 items-center justify-center gap-2 py-16 text-sm">
        <Loader2Icon className="size-4 animate-spin" />
        {tc("loading")}
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="py-8">
        {onMobileBack && (
          <button
            type="button"
            onClick={onMobileBack}
            className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-sm transition-colors md:hidden"
          >
            <ArrowLeftIcon className="size-4" />
            {t("title")}
          </button>
        )}
        <p className="text-destructive mt-4 text-sm">{error}</p>
      </div>
    );
  }

  if (!detail) return null;

  const { role, skills, resources } = detail;

  return (
    <div className="min-w-0">
      {/* 移动端:返回角色列表(桌面双栏常驻,不渲染) */}
      {onMobileBack && (
        <button
          type="button"
          onClick={onMobileBack}
          className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm transition-colors md:hidden"
        >
          <ArrowLeftIcon className="size-4" />
          {t("title")}
        </button>
      )}

      {/* header */}
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {isBuiltin ? (
            <ShieldCheckIcon className="text-muted-foreground size-5 shrink-0" />
          ) : (
            <UserIcon className="text-muted-foreground size-5 shrink-0" />
          )}
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold tracking-tight">
              {role.displayName}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                {role.roleId.slice(0, 12)}
                {role.roleId.length > 12 ? "…" : ""}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-xs ${
                  isBuiltin
                    ? "bg-blue-500/10 text-blue-500"
                    : "bg-emerald-500/10 text-emerald-500"
                }`}
              >
                {isBuiltin ? t("builtin") : t("custom")}
              </span>
              <SaveIndicator status={saveStatus} t={t} />
            </div>
          </div>
        </div>
        {!isBuiltin && (
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2Icon className="size-3.5" />
            {t("delete")}
          </Button>
        )}
      </div>

        {error && (
          <p className="text-destructive mb-4 text-sm">{error}</p>
        )}

        {uploadNotice && (
          <p
            role="alert"
            className={cn(
              "mb-4 rounded-md px-3 py-2 text-xs",
              uploadNotice.type === "success"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-destructive/10 text-destructive",
            )}
          >
            {uploadNotice.text}
          </p>
        )}

        {/* basic info card */}
        <section className="border-border/60 bg-card mb-6 rounded-lg border p-5">
          <h2 className="mb-4 text-sm font-medium">{t("detail")}</h2>
          {isBuiltin && (
            <p className="text-muted-foreground mb-3 text-xs">
              {t("builtinHint")}
            </p>
          )}
          <div className="grid gap-4">
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("displayName")}
              </span>
              <input
                value={displayName}
                autoComplete="off"
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  scheduleSave({ displayName: e.target.value });
                }}
                className="bg-background border-input h-9 rounded-md border px-2.5 text-sm outline-none disabled:opacity-50"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("description")}
              </span>
              <textarea
                value={description}
                autoComplete="off"
                onChange={(e) => {
                  setDescription(e.target.value);
                  scheduleSave({ description: e.target.value });
                }}
                className="bg-background border-input min-h-16 rounded-md border px-2.5 py-2 text-sm outline-none disabled:opacity-50"
                placeholder={t("descriptionPlaceholder")}
                rows={2}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("systemPrompt")}
              </span>
              <textarea
                value={systemPrompt}
                autoComplete="off"
                onChange={(e) => {
                  setSystemPrompt(e.target.value);
                  scheduleSave({ systemPrompt: e.target.value });
                }}
                className="bg-background border-input min-h-32 rounded-md border px-2.5 py-2 text-sm outline-none disabled:opacity-50"
                placeholder={t("systemPromptPlaceholder")}
                rows={6}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("suggestions")}
              </span>
              <textarea
                value={suggestions}
                autoComplete="off"
                onChange={(e) => {
                  setSuggestions(e.target.value);
                  scheduleSave({
                    suggestions: e.target.value.split("\n"),
                  });
                }}
                className="bg-background border-input min-h-20 rounded-md border px-2.5 py-2 text-sm outline-none disabled:opacity-50"
                placeholder={t("suggestionsPlaceholder")}
                rows={4}
              />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="grid gap-1.5">
                <span className="text-xs text-muted-foreground">
                  {t("priority")}
                </span>
                <input
                  type="number"
                  value={priority}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setPriority(v);
                    scheduleSave({ priority: v });
                  }}
                  className="bg-background border-input h-9 rounded-md border px-2.5 text-sm outline-none disabled:opacity-50"
                />
              </label>
              <label className="flex items-center gap-2 self-end pb-1">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => {
                    setEnabled(e.target.checked);
                    scheduleSave({ enabled: e.target.checked });
                  }}
                  className="size-4"
                />
                <span className="text-sm">{t("enabled")}</span>
              </label>
            </div>
          </div>
        </section>

        {/* skills card */}
        <section className="border-border/60 bg-card mb-6 rounded-lg border p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium">{t("skills")}</h2>
            <FilePickerButton
              accept=".zip"
              onSelect={handleSkillUpload}
              label={t("uploadSkill")}
              disabled={!!upload}
              busy={upload?.kind === "skill"}
            />
          </div>
          {upload?.kind === "skill" && <UploadProgress upload={upload} t={t} />}
          {skills.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noSkills")}</p>
          ) : (
            <div className="grid gap-2">
              {skills.map((s) => (
                <div
                  key={s.skillId}
                  className="border-border/40 flex items-start justify-between gap-3 rounded-md border px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{s.title}</span>
                      {s.version && (
                        <span className="text-muted-foreground bg-muted rounded px-1 py-0.5 text-[10px]">
                          v{s.version}
                        </span>
                      )}
                    </div>
                    {s.description && (
                      <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
                        {s.description}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteSkillTarget(s)}
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex size-6 shrink-0 items-center justify-center rounded transition-colors"
                  >
                    <Trash2Icon className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* resources card */}
        <section className="border-border/60 bg-card rounded-lg border p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium">{t("resources")}</h2>
            <FilePickerButton
              accept=".zip"
              onSelect={handleResourceUpload}
              label={t("uploadResource")}
              disabled={!!upload}
              busy={upload?.kind === "resource"}
            />
          </div>
          {upload?.kind === "resource" && (
            <UploadProgress upload={upload} t={t} />
          )}
          {resources.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noResources")}</p>
          ) : (
            <div className="grid gap-2">
              {resources.map((r) => (
                <div
                  key={r.resourceId}
                  className="border-border/40 flex items-start justify-between gap-3 rounded-md border px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium">{r.fileName}</span>
                    {r.createdAt && (
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {new Date(r.createdAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteResourceTarget(r)}
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex size-6 shrink-0 items-center justify-center rounded transition-colors"
                  >
                    <Trash2Icon className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* mcp servers card */}
        <section className="border-border/60 bg-card mt-6 rounded-lg border p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium">MCP Servers</h2>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => openMcpDialog(null)}
            >
              <PlusIcon className="size-3.5" />
              添加 MCP
            </Button>
          </div>
          {mcpServers.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              未配置外部 MCP server。添加后,对话中可勾选启用,也可在消息中用 @名称 指定。
            </p>
          ) : (
            <div className="grid gap-2">
              {mcpServers.map((s) => (
                <div
                  key={s.serverId}
                  className="border-border/40 flex items-start justify-between gap-3 rounded-md border px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{s.name}</span>
                      <span className="text-muted-foreground bg-muted rounded px-1 py-0.5 text-[10px]">
                        {s.serverId}
                      </span>
                      <label className="ml-1 flex cursor-pointer items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={s.enabled}
                          onChange={() => void handleMcpToggleEnabled(s)}
                          className="size-3"
                        />
                        启用
                      </label>
                    </div>
                    <p className="text-muted-foreground mt-0.5 truncate text-xs">
                      {s.url}
                      {s.headerKeys.length > 0 &&
                        ` · headers: ${s.headerKeys.join(", ")}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openMcpDialog(s)}
                      className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-6 items-center justify-center rounded transition-colors"
                    >
                      <PencilIcon className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleMcpDelete(s)}
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex size-6 items-center justify-center rounded transition-colors"
                    >
                      <Trash2Icon className="size-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      {/* mcp add/edit dialog */}
      <Dialog open={mcpDialogOpen} onOpenChange={setMcpDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mcpEditing ? "编辑 MCP" : "添加 MCP"}</DialogTitle>
            <DialogDescription>
              远程 MCP server(Streamable HTTP / SSE URL)
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">名称</span>
              <input
                value={mcpForm.name}
                autoComplete="off"
                onChange={(e) =>
                  setMcpForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="如 weather(对话中可用 @weather 指定)"
                className="bg-background border-input h-9 rounded-md border px-2.5 text-sm outline-none"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">URL</span>
              <input
                value={mcpForm.url}
                autoComplete="url"
                onChange={(e) =>
                  setMcpForm((f) => ({ ...f, url: e.target.value }))
                }
                placeholder="https://example.com/mcp"
                className="bg-background border-input h-9 rounded-md border px-2.5 text-sm outline-none"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">
                请求头(可选,每行一条,格式 Key: Value)
              </span>
              <textarea
                value={mcpForm.headers}
                autoComplete="off"
                onChange={(e) =>
                  setMcpForm((f) => ({ ...f, headers: e.target.value }))
                }
                placeholder={"Authorization: Bearer xxx"}
                className="bg-background border-input min-h-16 rounded-md border px-2.5 py-2 font-mono text-xs outline-none"
                rows={3}
              />
            </label>
            {mcpTestResult && (
              <p
                className={`text-xs ${mcpTestResult.startsWith("OK") ? "text-emerald-500" : "text-destructive"}`}
              >
                {mcpTestResult}
              </p>
            )}
          </div>
          <DialogFooter className="sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void handleMcpTest()}
              disabled={mcpTesting || !mcpForm.url}
            >
              {mcpTesting && <Loader2Icon className="size-3.5 animate-spin" />}
              测试连接
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMcpDialogOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button onClick={() => void handleMcpSave()}>保存</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* overwrite confirm dialog */}
      <Dialog
        open={!!overwriteTarget}
        onOpenChange={() => setOverwriteTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("overwriteTitle")}</DialogTitle>
            <DialogDescription>
              {t("overwriteConfirm", { name: overwriteTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverwriteTarget(null)}>
              {tc("cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmOverwrite}>
              {t("overwriteAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete role dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent
          className="sm:max-w-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !deleteBusy) {
              e.preventDefault();
              void handleDeleteRole();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("delete")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirm", { name: role.displayName })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteBusy}
            >
              {tc("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeleteRole()}
              disabled={deleteBusy}
              className="gap-1.5"
            >
              {deleteBusy && <Loader2Icon className="size-3.5 animate-spin" />}
              {tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete skill dialog */}
      <Dialog
        open={!!deleteSkillTarget}
        onOpenChange={() => setDeleteSkillTarget(null)}
      >
        <DialogContent
          className="sm:max-w-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && deleteSkillTarget && !deleteBusy) {
              e.preventDefault();
              void handleSkillDelete(deleteSkillTarget.skillId);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("delete")}</DialogTitle>
            <DialogDescription>
              {deleteSkillTarget
                ? t("deleteSkillConfirm", { name: deleteSkillTarget.title })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteSkillTarget(null)}
              disabled={deleteBusy}
            >
              {tc("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deleteSkillTarget && void handleSkillDelete(deleteSkillTarget.skillId)
              }
              disabled={deleteBusy}
              className="gap-1.5"
            >
              {deleteBusy && <Loader2Icon className="size-3.5 animate-spin" />}
              {tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete resource dialog */}
      <Dialog
        open={!!deleteResourceTarget}
        onOpenChange={() => setDeleteResourceTarget(null)}
      >
        <DialogContent
          className="sm:max-w-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && deleteResourceTarget && !deleteBusy) {
              e.preventDefault();
              void handleResourceDelete(deleteResourceTarget.resourceId);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("delete")}</DialogTitle>
            <DialogDescription>
              {deleteResourceTarget
                ? t("deleteResourceConfirm", {
                    name: deleteResourceTarget.fileName,
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteResourceTarget(null)}
              disabled={deleteBusy}
            >
              {tc("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deleteResourceTarget &&
                void handleResourceDelete(deleteResourceTarget.resourceId)
              }
              disabled={deleteBusy}
              className="gap-1.5"
            >
              {deleteBusy && <Loader2Icon className="size-3.5 animate-spin" />}
              {tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- sub-components ---------- */

const SaveIndicator: FC<{
  status: "idle" | "saving" | "saved" | "error";
  t: (key: string) => string;
}> = ({ status, t }) => {
  if (status === "idle") return null;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${
        status === "error"
          ? "text-destructive"
          : status === "saved"
            ? "text-emerald-500"
            : "text-muted-foreground"
      }`}
    >
      {status === "saving" && <Loader2Icon className="size-3 animate-spin" />}
      {status === "saved" && <CheckIcon className="size-3" />}
      {status === "error" && <AlertCircleIcon className="size-3" />}
      {t(
        status === "saving"
          ? "autoSaving"
          : status === "saved"
            ? "autoSaved"
            : "autoSaveFailed",
      )}
    </span>
  );
};

/** 上传进度行:文件名 + 百分比/处理中 + 进度条(处理阶段满格脉冲提示仍在服务端处理) */
const UploadProgress: FC<{
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

const FilePickerButton: FC<{
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
