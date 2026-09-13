"use client";

import { useCallback, useEffect, useRef, useState, type FC } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { getClientRuntimeContext } from "@/lib/client-runtime-context";
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
  };
  skills: SkillInfo[];
  resources: ResourceInfo[];
};

/* ---------- builtin set ---------- */

const builtinRoleIds = new Set(["general", "developer", "analyst"]);

/* ---------- page component ---------- */

export default function RoleDetailPage() {
  const t = useTranslations("roles");
  const tc = useTranslations("common");
  const router = useRouter();
  const params = useParams<{ roleId: string }>();
  const roleId = decodeURIComponent(params.roleId);

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

  /* delete dialog */
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSkillTarget, setDeleteSkillTarget] = useState<SkillInfo | null>(
    null,
  );
  const [deleteResourceTarget, setDeleteResourceTarget] =
    useState<ResourceInfo | null>(null);

  /* mcp state */
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);
  const [mcpDialogOpen, setMcpDialogOpen] = useState(false);
  const [mcpEditing, setMcpEditing] = useState<McpServerInfo | null>(null);
  const [mcpForm, setMcpForm] = useState({ name: "", url: "", headers: "" });
  const [mcpTesting, setMcpTesting] = useState(false);
  const [mcpTestResult, setMcpTestResult] = useState("");

  const isBuiltin = builtinRoleIds.has(roleId);

  /* ----- data loading ----- */

  const loadDetail = useCallback(async () => {
    setLoading(true);
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
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
      if (isBuiltin) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void saveFields(fields);
      }, 800);
    },
    [isBuiltin, saveFields],
  );

  /* ----- handlers ----- */

  const handleDeleteRole = async () => {
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
      router.push("/admin/roles");
    } catch {
      setError(t("deleteFailed"));
    }
    setDeleteOpen(false);
  };

  const handleSkillUpload = async (file: File) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(
        `/api/settings/skills/${encodeURIComponent(roleId)}`,
        { method: "POST", body: formData },
      );
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || t("saveFailed"));
      }
      await loadDetail();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("saveFailed"));
    }
  };

  const handleSkillDelete = async (skillId: string) => {
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
      await loadDetail();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("deleteFailed"));
    }
  };

  const handleResourceUpload = async (file: File) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(
        `/api/settings/roles/${encodeURIComponent(roleId)}/resources`,
        { method: "POST", body: formData },
      );
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || t("saveFailed"));
      }
      await loadDetail();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("saveFailed"));
    }
  };

  const handleResourceDelete = async (resourceId: string) => {
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
      await loadDetail();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("deleteFailed"));
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
      <div className="bg-background text-foreground min-h-screen">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <p className="text-muted-foreground text-sm">{tc("loading")}</p>
        </div>
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="bg-background text-foreground min-h-screen">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <Link
            href="/admin/roles"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeftIcon className="size-4" />
            {t("title")}
          </Link>
          <p className="text-destructive mt-4 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!detail) return null;

  const { role, skills, resources } = detail;

  return (
    <div className="bg-background text-foreground min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* back link */}
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/admin/roles"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeftIcon className="size-4" />
            {t("title")}
          </Link>
        </div>

        {/* header */}
        <div className="mb-8 flex items-start justify-between">
          <div className="flex items-center gap-3">
            {isBuiltin ? (
              <ShieldCheckIcon className="text-muted-foreground size-5 shrink-0" />
            ) : (
              <UserIcon className="text-muted-foreground size-5 shrink-0" />
            )}
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {role.displayName}
              </h1>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-muted-foreground bg-muted rounded px-1.5 py-0.5 text-xs">
                  {role.roleId}
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

        {/* basic info card */}
        <section className="border-border/60 bg-card mb-6 rounded-lg border p-5">
          <h2 className="mb-4 text-sm font-medium">{t("detail")}</h2>
          {isBuiltin && (
            <p className="text-muted-foreground mb-3 text-xs">
              {t("builtinNotEditable")}
            </p>
          )}
          <div className="grid gap-4">
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("displayName")}
              </span>
              <input
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  scheduleSave({ displayName: e.target.value });
                }}
                disabled={isBuiltin}
                className="bg-background border-input h-9 rounded-md border px-2.5 text-sm outline-none disabled:opacity-50"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("description")}
              </span>
              <textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  scheduleSave({ description: e.target.value });
                }}
                disabled={isBuiltin}
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
                onChange={(e) => {
                  setSystemPrompt(e.target.value);
                  scheduleSave({ systemPrompt: e.target.value });
                }}
                disabled={isBuiltin}
                className="bg-background border-input min-h-32 rounded-md border px-2.5 py-2 text-sm outline-none disabled:opacity-50"
                placeholder={t("systemPromptPlaceholder")}
                rows={6}
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
                  disabled={isBuiltin}
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
                  disabled={isBuiltin}
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
            {!isBuiltin && (
              <FilePickerButton
                accept=".zip"
                onSelect={handleSkillUpload}
                label={t("uploadSkill")}
              />
            )}
          </div>
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
                  {!isBuiltin && (
                    <button
                      type="button"
                      onClick={() => setDeleteSkillTarget(s)}
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex size-6 shrink-0 items-center justify-center rounded transition-colors"
                    >
                      <Trash2Icon className="size-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* resources card */}
        <section className="border-border/60 bg-card rounded-lg border p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium">{t("resources")}</h2>
            {!isBuiltin && (
              <FilePickerButton
                accept=".zip"
                onSelect={handleResourceUpload}
                label={t("uploadResource")}
              />
            )}
          </div>
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
                  {!isBuiltin && (
                    <button
                      type="button"
                      onClick={() => setDeleteResourceTarget(r)}
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex size-6 shrink-0 items-center justify-center rounded transition-colors"
                    >
                      <Trash2Icon className="size-3" />
                    </button>
                  )}
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
      </div>

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

      {/* delete role dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("delete")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirm", { name: role.displayName })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDeleteRole}>
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
        <DialogContent className="sm:max-w-sm">
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
            >
              {tc("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deleteSkillTarget && handleSkillDelete(deleteSkillTarget.skillId)
              }
            >
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
        <DialogContent className="sm:max-w-sm">
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
            >
              {tc("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deleteResourceTarget &&
                handleResourceDelete(deleteResourceTarget.resourceId)
              }
            >
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

const FilePickerButton: FC<{
  accept: string;
  onSelect: (file: File) => void;
  label: string;
}> = ({ accept, onSelect, label }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
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
        onClick={() => inputRef.current?.click()}
      >
        <UploadIcon className="size-3.5" />
        {label}
      </Button>
    </>
  );
};
