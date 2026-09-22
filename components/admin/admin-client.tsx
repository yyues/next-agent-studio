"use client";

import { useCallback, useEffect, useState, type FC } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  ArrowLeftIcon,
  FileJsonIcon,
  GlobeIcon,
  Loader2Icon,
  PencilIcon,
  PlugZapIcon,
  PlusIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FilePickerButton,
  UploadProgress,
  UploadRejected,
  UploadState,
  uploadFileWithProgress,
} from "@/components/settings/upload-shared";
import { McpImportDialog } from "@/components/settings/mcp-import-dialog";
import { McpStudio } from "@/components/settings/mcp-studio";

/**
 * 全局资源库维护页(/admin,仅管理员可达):
 * - 全局 skills:上传 zip / 删除,存 skills/general/;内置角色自动注入,
 *   自定义角色经"从库中选择"引用挂载
 * - 全局 MCP:增删改 / 测试连接 / 启停,内置角色自动生效
 * 签名元素:所有资源行带"共享"地球徽标,与角色私有资源视觉区分。
 */

type GlobalSkill = {
  skillId: string;
  title: string;
  description: string;
  version: string;
  enabled: boolean;
};

type McpRow = {
  serverId: string;
  name: string;
  type?: "http" | "stdio";
  url: string;
  command?: string;
  args?: string[];
  enabled: boolean;
  mounted: boolean;
  headerKeys: string[];
  envKeys?: string[];
};

export const AdminClient: FC<{ initialTab?: "resources" | "mcp" }> = ({
  initialTab = "resources",
}) => {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const tr = useTranslations("roles");
  const router = useRouter();

  /* ----- 全局 skills ----- */
  const [skills, setSkills] = useState<GlobalSkill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [overwriteFile, setOverwriteFile] = useState<File | null>(null);
  const [deleteSkillTarget, setDeleteSkillTarget] = useState<GlobalSkill | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSkills = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/skills");
      if (!res.ok) return;
      const data = (await res.json()) as { skills?: GlobalSkill[] };
      setSkills(data.skills ?? []);
    } catch {
      // 静默:保留已有列表
    } finally {
      setSkillsLoading(false);
    }
  }, []);

  const performUpload = useCallback(
    async (file: File, opts?: { overwrite?: boolean }) => {
      const base = "/api/admin/skills";
      const url = opts?.overwrite ? `${base}?overwrite=true` : base;
      setUpload({ kind: "skill", fileName: file.name, percent: 0, phase: "transferring" });
      try {
        await uploadFileWithProgress(url, file, (percent, phase) =>
          setUpload((prev) => (prev ? { ...prev, percent, phase } : prev)),
        );
        await loadSkills();
      } catch (e) {
        if (
          e instanceof UploadRejected &&
          (e.code === "SKILL_ID_EXISTS" || e.code === "DUPLICATE_CONTENT")
        ) {
          setOverwriteFile(file);
        }
        // 其余错误静默(上传失败不弹全局错误,列表未变)
      } finally {
        setUpload(null);
      }
    },
    [loadSkills],
  );

  const handleSkillDelete = async () => {
    if (!deleteSkillTarget || busy) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/skills?skillId=${encodeURIComponent(deleteSkillTarget.skillId)}`, {
        method: "DELETE",
      });
      setDeleteSkillTarget(null);
      await loadSkills();
    } finally {
      setBusy(false);
    }
  };

  /* ----- 全局 MCP ----- */
  const [mcps, setMcps] = useState<McpRow[]>([]);
  const [mcpsLoading, setMcpsLoading] = useState(true);
  const [mcpDialogOpen, setMcpDialogOpen] = useState(false);
  const [mcpEditing, setMcpEditing] = useState<McpRow | null>(null);
  const [mcpForm, setMcpForm] = useState({
    type: "http" as "http" | "stdio",
    name: "",
    url: "",
    headers: "",
    command: "",
    args: "",
    env: "",
  });
  const [mcpTesting, setMcpTesting] = useState(false);
  const [mcpTestResult, setMcpTestResult] = useState("");
  const [mcpImportOpen, setMcpImportOpen] = useState(false);

  const loadMcps = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/mcp");
      if (!res.ok) return;
      const data = (await res.json()) as { servers?: McpRow[] };
      setMcps(data.servers ?? []);
    } catch {
      // 静默
    } finally {
      setMcpsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSkills();
    void loadMcps();
  }, [loadSkills, loadMcps]);

  const openMcpDialog = (target: McpRow | null) => {
    setMcpEditing(target);
    setMcpForm({
      type: target?.type === "stdio" ? "stdio" : "http",
      name: target?.name ?? "",
      url: target?.url ?? "",
      headers: "",
      command: target?.command ?? "",
      args: (target?.args ?? []).join("\n"),
      env: "",
    });
    setMcpTestResult("");
    setMcpDialogOpen(true);
  };

  /** headers/env 文本域按 "Key: Value" 每行一条解析 */
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

  /** args 文本域每行一个参数 */
  const parseArgs = (raw: string): string[] =>
    raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

  /** 表单 → upsert/test 载荷(类型无关字段都带上,服务端按 type 归一) */
  const mcpFormPayload = () => ({
    type: mcpForm.type,
    name: mcpForm.name,
    url: mcpForm.url,
    headers: parseHeaders(mcpForm.headers),
    command: mcpForm.command,
    args: parseArgs(mcpForm.args),
    env: parseHeaders(mcpForm.env),
  });

  const handleMcpSave = async () => {
    try {
      const res = await fetch("/api/admin/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId: mcpEditing?.serverId,
          ...mcpFormPayload(),
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || t("saveFailed"));
      }
      setMcpDialogOpen(false);
      await loadMcps();
    } catch (e) {
      setMcpTestResult(e instanceof Error ? e.message : t("saveFailed"));
    }
  };

  const handleMcpTest = async () => {
    setMcpTesting(true);
    setMcpTestResult("");
    try {
      const res = await fetch("/api/admin/mcp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mcpFormPayload()),
      });
      const data = (await res.json()) as { toolNames?: string[]; error?: string };
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

  const handleMcpToggle = async (server: McpRow) => {
    await fetch("/api/admin/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serverId: server.serverId,
        name: server.name,
        type: server.type ?? "http",
        url: server.url,
        command: server.command ?? "",
        args: server.args ?? [],
        enabled: !server.enabled,
      }),
    });
    await loadMcps();
  };

  const handleMcpMountToggle = async (server: McpRow) => {
    await fetch("/api/admin/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serverId: server.serverId,
        name: server.name,
        type: server.type ?? "http",
        url: server.url,
        command: server.command ?? "",
        args: server.args ?? [],
        mounted: !server.mounted,
      }),
    });
    await loadMcps();
  };

  const handleMcpDelete = async (server: McpRow) => {
    await fetch(`/api/admin/mcp?serverId=${encodeURIComponent(server.serverId)}`, {
      method: "DELETE",
    });
    await loadMcps();
  };

  /* ----- render ----- */

  const sharedBadge = (
    <span className="bg-chart-1/10 text-chart-1 inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium">
      <GlobeIcon className="size-2.5" />
      {t("sharedBadge")}
    </span>
  );

  if (initialTab === "mcp") {
    return (
      <div className="from-primary/5 via-background to-background min-h-dvh bg-gradient-to-b">
        <header className="bg-background/70 border-border/50 sticky top-0 z-20 border-b backdrop-blur-md">
          <div className="mx-auto flex h-12 max-w-6xl items-center gap-2 px-4">
            <button
              type="button"
              onClick={() => router.push("/chat")}
              className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm transition-colors"
            >
              <ArrowLeftIcon className="size-4" />
              <span className="hidden sm:inline">返回对话</span>
            </button>
            <span className="text-muted-foreground ml-auto text-xs font-medium">
              MCP Studio · 管理员
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl min-w-0 overflow-hidden px-4 py-8">
          <div className="mb-7 flex items-end justify-between gap-4">
            <div>
              <p className="text-primary text-xs font-semibold tracking-[0.16em] uppercase">
                Global tool desk
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">全局 MCP Studio</h1>
              <p className="text-muted-foreground mt-1.5 text-sm">
                连接、检查并安全调试全局 MCP 工具。
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => router.push("/admin")}>
              返回资源管理
            </Button>
          </div>
          <McpStudio admin />
        </main>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-dvh">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:py-10">
        {/* header */}
        <div className="mb-8 flex items-start gap-3">
          <span className="bg-primary/10 text-primary mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg">
            <ShieldCheckIcon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
            <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => router.push("/chat")}
          >
            <ArrowLeftIcon className="size-3.5" />
            {t("backToChat")}
          </Button>
        </div>

        {/* 全局 skills */}
        <section className="border-border/60 bg-card mb-6 rounded-xl border p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <SparklesIcon className="text-primary size-4 shrink-0" />
              <h2 className="text-sm font-medium">{t("skillsTitle")}</h2>
              {sharedBadge}
            </div>
            <FilePickerButton
              accept=".zip"
              label={t("uploadSkill")}
              disabled={!!upload}
              busy={upload?.kind === "skill"}
              onSelect={(file) => void performUpload(file)}
            />
          </div>
          <p className="text-muted-foreground mb-4 text-xs">{t("skillsHint")}</p>
          {upload && <UploadProgress upload={upload} t={tr} />}
          {skillsLoading ? (
            <p className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
              <Loader2Icon className="size-4 animate-spin" />
              {tc("loading")}
            </p>
          ) : skills.length === 0 ? (
            <p className="text-muted-foreground py-2 text-sm">{t("noSkills")}</p>
          ) : (
            <div className="grid gap-2">
              {skills.map((s) => (
                <div
                  key={s.skillId}
                  className="border-border/40 flex min-w-0 items-start justify-between gap-3 rounded-md border px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{s.title}</span>
                      {s.version && (
                        <span className="text-muted-foreground bg-muted rounded px-1 py-0.5 font-mono text-[10px]">
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
                    aria-label={tc("delete")}
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex size-6 shrink-0 items-center justify-center rounded transition-colors"
                  >
                    <Trash2Icon className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 全局 MCP */}
        <section className="border-border/60 bg-card rounded-xl border p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <PlugZapIcon className="text-chart-2 size-4 shrink-0" />
              <h2 className="text-sm font-medium">{t("mcpTitle")}</h2>
              {sharedBadge}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => router.push("/admin?tab=mcp")}
              >
                <PlugZapIcon className="size-3.5" />
                Studio
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setMcpImportOpen(true)}
              >
                <FileJsonIcon className="size-3.5" />
                {t("mcpImport")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => openMcpDialog(null)}
              >
                <PlusIcon className="size-3.5" />
                {t("addMcp")}
              </Button>
            </div>
          </div>
          <p className="text-muted-foreground mb-4 text-xs">{t("mcpHint")}</p>
          {mcpsLoading ? (
            <p className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
              <Loader2Icon className="size-4 animate-spin" />
              {tc("loading")}
            </p>
          ) : mcps.length === 0 ? (
            <p className="text-muted-foreground py-2 text-sm">{t("noMcps")}</p>
          ) : (
            <div className="grid gap-2">
              {mcps.map((s) => (
                <div
                  key={s.serverId}
                  className="border-border/40 flex min-w-0 items-start justify-between gap-3 rounded-md border px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{s.name}</span>
                      <span className="text-muted-foreground bg-muted rounded px-1 py-0.5 font-mono text-[10px]">
                        {s.serverId}
                      </span>
                      {s.type === "stdio" && (
                        <span className="bg-violet-500/10 text-violet-600 dark:text-violet-400 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]">
                          stdio
                        </span>
                      )}
                      <label className="ml-1 flex cursor-pointer items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={s.enabled}
                          onChange={() => void handleMcpToggle(s)}
                          className="size-3"
                        />
                        {t("enabled")}
                      </label>
                      <label
                        className="flex cursor-pointer items-center gap-1 text-xs"
                        title={t("mountedHint")}
                      >
                        <input
                          type="checkbox"
                          checked={s.mounted}
                          onChange={() => void handleMcpMountToggle(s)}
                          className="size-3"
                        />
                        {t("mounted")}
                      </label>
                    </div>
                    <p className="text-muted-foreground mt-0.5 truncate text-xs">
                      {s.type === "stdio"
                        ? [s.command, ...(s.args ?? [])].filter(Boolean).join(" ")
                        : s.url}
                      {s.headerKeys.length > 0 && ` · headers: ${s.headerKeys.join(", ")}`}
                      {(s.envKeys ?? []).length > 0 && ` · env: ${s.envKeys!.join(", ")}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openMcpDialog(s)}
                      aria-label={t("editMcp")}
                      className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-6 items-center justify-center rounded transition-colors"
                    >
                      <PencilIcon className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleMcpDelete(s)}
                      aria-label={tc("delete")}
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

      {/* MCP 编辑弹窗 */}
      <Dialog open={mcpDialogOpen} onOpenChange={setMcpDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mcpEditing ? t("editMcp") : t("addMcp")}</DialogTitle>
            <DialogDescription>{t("mcpDialogDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {/* 类型切换 */}
            <div className="bg-muted inline-flex w-fit rounded-md p-0.5 text-xs">
              {(
                [
                  ["http", t("mcpTypeUrl")],
                  ["stdio", t("mcpTypeStdio")],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMcpForm((f) => ({ ...f, type: value }))}
                  className={cn(
                    "rounded px-2.5 py-1 transition-colors",
                    mcpForm.type === value
                      ? "bg-background text-foreground shadow-sm font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="grid gap-1.5">
              <span className="text-muted-foreground text-xs">{t("mcpName")}</span>
              <input
                value={mcpForm.name}
                autoComplete="off"
                onChange={(e) => setMcpForm((f) => ({ ...f, name: e.target.value }))}
                className="bg-background border-input focus-visible:border-primary focus-visible:ring-primary/30 h-9 rounded-md border px-2.5 text-sm outline-none focus-visible:ring-2"
              />
            </label>
            {mcpForm.type === "http" ? (
              <>
                <label className="grid gap-1.5">
                  <span className="text-muted-foreground text-xs">URL</span>
                  <input
                    value={mcpForm.url}
                    autoComplete="url"
                    onChange={(e) => setMcpForm((f) => ({ ...f, url: e.target.value }))}
                    className="bg-background border-input focus-visible:border-primary focus-visible:ring-primary/30 h-9 rounded-md border px-2.5 font-mono text-sm outline-none focus-visible:ring-2"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-muted-foreground text-xs">{t("mcpHeaders")}</span>
                  <textarea
                    value={mcpForm.headers}
                    autoComplete="off"
                    onChange={(e) => setMcpForm((f) => ({ ...f, headers: e.target.value }))}
                    placeholder="Authorization: Bearer xxx"
                    className="bg-background border-input focus-visible:border-primary focus-visible:ring-primary/30 min-h-16 rounded-md border px-2.5 py-2 font-mono text-xs outline-none focus-visible:ring-2"
                    rows={3}
                  />
                </label>
              </>
            ) : (
              <>
                <label className="grid gap-1.5">
                  <span className="text-muted-foreground text-xs">{t("mcpCommand")}</span>
                  <input
                    value={mcpForm.command}
                    autoComplete="off"
                    onChange={(e) => setMcpForm((f) => ({ ...f, command: e.target.value }))}
                    placeholder="npx / node / uvx"
                    className="bg-background border-input focus-visible:border-primary focus-visible:ring-primary/30 h-9 rounded-md border px-2.5 font-mono text-sm outline-none focus-visible:ring-2"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-muted-foreground text-xs">{t("mcpArgs")}</span>
                  <textarea
                    value={mcpForm.args}
                    autoComplete="off"
                    onChange={(e) => setMcpForm((f) => ({ ...f, args: e.target.value }))}
                    placeholder={"-y\n@modelcontextprotocol/server-memory"}
                    className="bg-background border-input focus-visible:border-primary focus-visible:ring-primary/30 min-h-16 rounded-md border px-2.5 py-2 font-mono text-xs outline-none focus-visible:ring-2"
                    rows={3}
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-muted-foreground text-xs">{t("mcpEnv")}</span>
                  <textarea
                    value={mcpForm.env}
                    autoComplete="off"
                    onChange={(e) => setMcpForm((f) => ({ ...f, env: e.target.value }))}
                    placeholder="API_KEY: xxx"
                    className="bg-background border-input focus-visible:border-primary focus-visible:ring-primary/30 min-h-16 rounded-md border px-2.5 py-2 font-mono text-xs outline-none focus-visible:ring-2"
                    rows={3}
                  />
                </label>
              </>
            )}
            {mcpTestResult && (
              <p
                className={cn(
                  "text-xs",
                  mcpTestResult.startsWith("OK") ? "text-emerald-500" : "text-destructive",
                )}
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
              disabled={mcpTesting || (mcpForm.type === "http" ? !mcpForm.url : !mcpForm.command)}
            >
              {mcpTesting && <Loader2Icon className="size-3.5 animate-spin" />}
              {t("testConnection")}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMcpDialogOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button onClick={() => void handleMcpSave()}>{tc("save")}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MCP JSON 导入弹窗:save 走 /api/admin/mcp upsert,完成后刷新列表 */}
      <McpImportDialog
        open={mcpImportOpen}
        onOpenChange={setMcpImportOpen}
        save={async (entry) => {
          const res = await fetch("/api/admin/mcp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: entry.name,
              type: entry.command ? "stdio" : "http",
              url: entry.url,
              headers: entry.headers,
              command: entry.command,
              args: entry.args,
              env: entry.env,
            }),
          });
          if (!res.ok) {
            const err = (await res.json()) as { error?: string };
            throw new Error(err.error || t("saveFailed"));
          }
        }}
        onImported={() => void loadMcps()}
      />

      {/* 覆盖上传确认 */}
      <Dialog open={!!overwriteFile} onOpenChange={() => setOverwriteFile(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{tr("overwriteTitle")}</DialogTitle>
            <DialogDescription>
              {tr("overwriteConfirm", { name: overwriteFile?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverwriteFile(null)}>
              {tc("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const file = overwriteFile;
                setOverwriteFile(null);
                if (file) void performUpload(file, { overwrite: true });
              }}
            >
              {tr("overwriteAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除 skill 确认 */}
      <Dialog open={!!deleteSkillTarget} onOpenChange={() => setDeleteSkillTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{tc("delete")}</DialogTitle>
            <DialogDescription>
              {t("deleteSkillConfirm", { name: deleteSkillTarget?.title ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSkillTarget(null)} disabled={busy}>
              {tc("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleSkillDelete()}
              disabled={busy}
              className="gap-1.5"
            >
              {busy && <Loader2Icon className="size-3.5 animate-spin" />}
              {tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
