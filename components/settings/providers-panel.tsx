"use client";

import { useCallback, useEffect, useState, type FC } from "react";
import { useTranslations } from "next-intl";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  CpuIcon,
  DownloadIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  PlugZapIcon,
  Trash2Icon,
  ZapIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getClientRuntimeContext } from "@/lib/client-runtime-context";
import { cn } from "@/lib/utils";

type ProviderItem = {
  providerId: string;
  name: string;
  providerName: string;
  baseUrl: string;
  model: string;
  temperature: number;
  active: boolean;
  maskedApiKey: string;
};

type ExportData = {
  deepLink: string;
  claudeSettings: { env: Record<string, string> };
  backup: Record<string, unknown>;
};

const inputBase =
  "bg-background border-input h-11 w-full rounded-md border px-3 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-primary/30 focus-visible:ring-2";

/**
 * 供应商面板(统一设置页 /settings 的「模型供应商」标签):
 * 说明 + 主 CTA → 供应商列表(空状态引导) → 内置 Embedding(默认折叠,渐进披露)。
 */
export const ProvidersPanel: FC = () => {
  const t = useTranslations("settings");
  const tc = useTranslations("common");

  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  /* 供应商弹窗 */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProviderItem | null>(null);
  const [form, setForm] = useState({
    name: "",
    baseUrl: "",
    apiKey: "",
    model: "",
    temperature: 0.7,
  });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  /* 导出弹窗 */
  const [exportTarget, setExportTarget] = useState<ProviderItem | null>(null);
  const [exportData, setExportData] = useState<ExportData | null>(null);
  const [copied, setCopied] = useState(false);

  /* 删除确认 */
  const [deleteTarget, setDeleteTarget] = useState<ProviderItem | null>(null);

  /* embedding(默认折叠) */
  const [embedding, setEmbedding] = useState({
    model: "",
    baseUrl: "",
    apiKey: "",
    maskedApiKey: "",
  });
  const [embeddingOpen, setEmbeddingOpen] = useState(false);
  const [embeddingSaving, setEmbeddingSaving] = useState(false);

  const userId = () => getClientRuntimeContext().userId;

  const loadProviders = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/settings/providers?userId=${encodeURIComponent(userId())}`,
      );
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as { providers: ProviderItem[] };
      setProviders(data.providers ?? []);
    } catch {
      setMessage({ type: "error", text: t("loadFailed") });
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadEmbedding = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/settings/embedding?userId=${encodeURIComponent(userId())}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        model: string;
        baseUrl: string;
        maskedApiKey: string;
      };
      setEmbedding((prev) => ({
        ...prev,
        model: data.model,
        baseUrl: data.baseUrl,
        maskedApiKey: data.maskedApiKey,
      }));
    } catch {
      // 静默
    }
  }, []);

  useEffect(() => {
    void loadProviders();
    void loadEmbedding();
  }, [loadProviders, loadEmbedding]);

  /* ----- 供应商操作 ----- */

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", baseUrl: "", apiKey: "", model: "", temperature: 0.7 });
    setFormError("");
    setDialogOpen(true);
  };

  const openEdit = (p: ProviderItem) => {
    setEditing(p);
    setForm({
      name: p.name,
      baseUrl: p.baseUrl,
      apiKey: "",
      model: p.model,
      temperature: p.temperature,
    });
    setFormError("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (saving) return;
    if (!form.name.trim() || !form.baseUrl.trim() || !form.model.trim()) {
      setFormError(t("missingFields"));
      return;
    }
    if (!editing && !form.apiKey.trim()) {
      setFormError(t("enterKey"));
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const url = editing
        ? `/api/settings/providers/${encodeURIComponent(editing.providerId)}`
        : "/api/settings/providers";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userId(),
          providerId: editing?.providerId,
          name: form.name,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey || undefined,
          model: form.model,
          temperature: form.temperature,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || t("saveFailed"));
      }
      setDialogOpen(false);
      setMessage({ type: "success", text: t("saved") });
      await loadProviders();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (p: ProviderItem) => {
    setBusyId(p.providerId);
    try {
      await fetch(
        `/api/settings/providers/${encodeURIComponent(p.providerId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: userId() }),
        },
      );
      await loadProviders();
      setMessage({ type: "success", text: t("activated", { name: p.name }) });
    } finally {
      setBusyId(null);
    }
  };

  const handleTest = async (p: ProviderItem) => {
    setBusyId(p.providerId);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/settings/providers/${encodeURIComponent(p.providerId)}/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: userId() }),
        },
      );
      const data = (await res.json()) as { ok: boolean; error?: string };
      setMessage(
        data.ok
          ? { type: "success", text: t("testSuccess") }
          : { type: "error", text: data.error || t("testFailed") },
      );
    } catch {
      setMessage({ type: "error", text: t("testFailed") });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setBusyId(target.providerId);
    try {
      await fetch(
        `/api/settings/providers/${encodeURIComponent(target.providerId)}?userId=${encodeURIComponent(userId())}`,
        { method: "DELETE" },
      );
      await loadProviders();
    } finally {
      setBusyId(null);
    }
  };

  /* ----- 导出 ----- */

  const openExport = async (p: ProviderItem) => {
    setExportTarget(p);
    setExportData(null);
    setCopied(false);
    try {
      const res = await fetch(
        `/api/settings/providers/${encodeURIComponent(p.providerId)}/export?userId=${encodeURIComponent(userId())}`,
      );
      if (res.ok) setExportData((await res.json()) as ExportData);
    } catch {
      // 弹窗内展示失败态
    }
  };

  const copySettingsJson = async () => {
    if (!exportData) return;
    await navigator.clipboard.writeText(
      JSON.stringify(exportData.claudeSettings, null, 2),
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadBackup = () => {
    if (!exportData || !exportTarget) return;
    const blob = new Blob([JSON.stringify(exportData.backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportTarget.name}-cc-switch.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ----- embedding ----- */

  const saveEmbedding = async () => {
    if (embeddingSaving) return;
    setEmbeddingSaving(true);
    try {
      const res = await fetch("/api/settings/embedding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userId(),
          embeddingBaseUrl: embedding.baseUrl,
          embeddingApiKey: embedding.apiKey || undefined,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          model: string;
          baseUrl: string;
          maskedApiKey: string;
        };
        setEmbedding((prev) => ({
          ...prev,
          apiKey: "",
          model: data.model,
          baseUrl: data.baseUrl,
          maskedApiKey: data.maskedApiKey,
        }));
        setMessage({ type: "success", text: t("saved") });
      }
    } finally {
      setEmbeddingSaving(false);
    }
  };

  const iconBtn =
    "text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-50";

  return (
    <div>
      {/* 面板头:模块说明 + 主 CTA(每个面板一个主操作) */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
          {t("multiDesc")}
        </p>
        <Button className="gap-1.5" onClick={openCreate}>
          <PlusIcon className="size-4" />
          {t("addProvider")}
        </Button>
      </div>

        {message && (
          <p
            role="alert"
            className={cn(
              "mb-4 rounded-md px-3 py-2 text-xs",
              message.type === "success"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-destructive/10 text-destructive",
            )}
          >
            {message.text}
          </p>
        )}

        {/* 供应商列表 */}
        {loading ? (
          <div className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
            <Loader2Icon className="size-4 animate-spin" />
            {tc("loading")}
          </div>
        ) : providers.length === 0 ? (
          /* 空状态:引导用户完成第一步(空状态 + 行动指引) */
          <button
            type="button"
            onClick={openCreate}
            className="hover:border-primary/40 hover:bg-primary/5 aui-lift group mt-2 flex w-full cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed border-border py-14 text-center transition-colors"
          >
            <span className="bg-primary/10 text-primary group-hover:scale-105 flex size-12 items-center justify-center rounded-full transition-transform duration-200 motion-reduce:transition-none motion-reduce:transform-none">
              <CpuIcon className="size-5" />
            </span>
            <span className="text-foreground text-sm font-medium">
              {t("emptyProviders")}
            </span>
            <span className="text-muted-foreground max-w-xs text-xs leading-relaxed">
              {t("emptyProvidersHint")}
            </span>
            <span className="text-primary mt-1 inline-flex items-center gap-1 text-xs font-medium">
              <PlusIcon className="size-3.5" />
              {t("addProvider")}
            </span>
          </button>
        ) : (
          <div className="grid gap-2.5">
            {providers.map((p, i) => (
              <div
                key={p.providerId}
                style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                className={cn(
                  "aui-anim-item aui-lift relative overflow-hidden rounded-xl border px-4 py-3.5",
                  p.active
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/60 bg-card",
                )}
              >
                {/* 激活项左侧色条 */}
                {p.active && (
                  <span className="bg-primary absolute start-0 inset-y-0 w-1" />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{p.name}</span>
                  {p.active ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="bg-primary size-1.5 rounded-full" />
                      <span className="text-primary text-xs font-medium">
                        {t("activeBadge")}
                      </span>
                    </span>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2.5 text-xs"
                      disabled={busyId === p.providerId}
                      onClick={() => void handleActivate(p)}
                    >
                      <ZapIcon className="size-3" />
                      {t("activate")}
                    </Button>
                  )}
                </div>
                <p className="text-muted-foreground mt-1.5 truncate font-mono text-xs">
                  {p.model} · {p.baseUrl} · {p.maskedApiKey}
                </p>
                <div className="mt-2.5 flex items-center gap-0.5 border-t border-border/40 pt-2">
                  <span className="text-muted-foreground flex-1 text-[11px]">
                    {t("temperature")}: {p.temperature.toFixed(1)}
                  </span>
                  <button
                    type="button"
                    className={iconBtn}
                    title={t("test")}
                    disabled={busyId === p.providerId}
                    onClick={() => void handleTest(p)}
                  >
                    {busyId === p.providerId ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <PlugZapIcon className="size-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={iconBtn}
                    title={t("exportCcSwitch")}
                    onClick={() => void openExport(p)}
                  >
                    <DownloadIcon className="size-4" />
                  </button>
                  <button
                    type="button"
                    className={iconBtn}
                    title={tc("edit")}
                    onClick={() => openEdit(p)}
                  >
                    <PencilIcon className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex size-8 items-center justify-center rounded-md transition-colors"
                    title={tc("delete")}
                    onClick={() => setDeleteTarget(p)}
                  >
                    <Trash2Icon className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 内置 Embedding:默认折叠,弱化为次要配置(渐进披露) */}
        <section className="border-border/60 bg-card/50 mt-10 overflow-hidden rounded-xl border">
          <button
            type="button"
            onClick={() => setEmbeddingOpen((v) => !v)}
            aria-expanded={embeddingOpen}
            className="hover:bg-muted/50 flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors"
          >
            <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
              <CpuIcon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">
                {t("embeddingSection")}
              </span>
              <span className="text-muted-foreground block truncate font-mono text-xs">
                {embedding.model}
                {embedding.baseUrl ? ` · ${embedding.baseUrl}` : ""}
              </span>
            </span>
            <ChevronDownIcon
              className={cn(
                "text-muted-foreground size-4 shrink-0 transition-transform duration-200",
                embeddingOpen && "rotate-180",
              )}
            />
          </button>
          {embeddingOpen && (
            <div className="aui-anim-item border-t border-border/40 px-4 pt-1 pb-4">
              <p className="text-muted-foreground py-2.5 text-xs">
                {t("embeddingBuiltinHint")}
              </p>
              <div className="grid gap-3">
                <label className="grid gap-1.5">
                  <span className="text-foreground text-sm font-medium">
                    {t("embeddingModel")}
                  </span>
                  <input
                    value={embedding.model}
                    readOnly
                    autoComplete="off"
                    className="bg-muted text-muted-foreground h-11 w-full cursor-not-allowed rounded-md border border-input px-3 text-sm opacity-70"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-foreground text-sm font-medium">
                    {t("embeddingBaseUrl")}
                  </span>
                  <input
                    value={embedding.baseUrl}
                    onChange={(e) =>
                      setEmbedding((f) => ({ ...f, baseUrl: e.target.value }))
                    }
                    placeholder={t("embeddingBaseUrlPlaceholder")}
                    autoComplete="url"
                    className={inputBase}
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-foreground text-sm font-medium">
                    {t("embeddingApiKey")}
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={embedding.apiKey}
                    onChange={(e) =>
                      setEmbedding((f) => ({ ...f, apiKey: e.target.value }))
                    }
                    placeholder={embedding.maskedApiKey || t("enterKey")}
                    className={inputBase}
                  />
                </label>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={embeddingSaving}
                    onClick={() => void saveEmbedding()}
                  >
                    {embeddingSaving && (
                      <Loader2Icon className="size-3.5 animate-spin" />
                    )}
                    {embeddingSaving ? t("saving") : tc("save")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 底部说明 */}
        <p className="text-muted-foreground/70 mt-8 text-center text-xs">
          {t("footerHint")}
        </p>

      {/* 新建/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? t("editProvider") : t("addProvider")}
            </DialogTitle>
            <DialogDescription>{t("multiDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label htmlFor="pv-name" className="grid gap-1.5">
              <span className="text-foreground text-sm font-medium">
                {t("providerName")}
              </span>
              <input
                id="pv-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder={t("providerNamePlaceholder")}
                autoComplete="off"
                className={inputBase}
              />
            </label>
            <label htmlFor="pv-url" className="grid gap-1.5">
              <span className="text-foreground text-sm font-medium">
                {t("baseUrl")}
              </span>
              <input
                id="pv-url"
                value={form.baseUrl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, baseUrl: e.target.value }))
                }
                placeholder="https://api.openai.com/v1"
                autoComplete="url"
                className={inputBase}
              />
            </label>
            <label htmlFor="pv-key" className="grid gap-1.5">
              <span className="text-foreground text-sm font-medium">
                {t("apiKey")}
              </span>
              <input
                id="pv-key"
                type="password"
                autoComplete="new-password"
                value={form.apiKey}
                onChange={(e) =>
                  setForm((f) => ({ ...f, apiKey: e.target.value }))
                }
                placeholder={editing?.maskedApiKey || t("enterKey")}
                className={inputBase}
              />
            </label>
            <label htmlFor="pv-model" className="grid gap-1.5">
              <span className="text-foreground text-sm font-medium">
                {t("model")}
              </span>
              <input
                id="pv-model"
                value={form.model}
                onChange={(e) =>
                  setForm((f) => ({ ...f, model: e.target.value }))
                }
                placeholder="gpt-4o-mini"
                autoComplete="off"
                className={inputBase}
              />
            </label>
            <label htmlFor="pv-temp" className="grid gap-1.5">
              <span className="text-foreground text-sm font-medium">
                {t("temperature")}: {form.temperature.toFixed(1)}
              </span>
              <input
                id="pv-temp"
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={form.temperature}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    temperature: Number(e.target.value),
                  }))
                }
                className="accent-primary h-11"
              />
            </label>
            {formError && (
              <p role="alert" className="text-destructive text-xs">
                {formError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={saving}
              className="gap-1.5"
            >
              {saving && <Loader2Icon className="size-3.5 animate-spin" />}
              {saving ? t("saving") : tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* cc-switch 导出弹窗 */}
      <Dialog
        open={!!exportTarget}
        onOpenChange={() => setExportTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("exportCcSwitch")}</DialogTitle>
            <DialogDescription>
              {t("exportDesc", { name: exportTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          {!exportData ? (
            <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
              <Loader2Icon className="size-4 animate-spin" />
              {tc("loading")}
            </div>
          ) : (
            <div className="grid min-w-0 gap-3">
              <Button
                className="w-full justify-center gap-1.5"
                onClick={() => {
                  window.location.href = exportData.deepLink;
                }}
              >
                <ZapIcon className="size-4" />
                {t("exportDeepLink")}
              </Button>
              <p className="text-muted-foreground text-xs">
                {t("exportDeepLinkHint")}
              </p>
              <div className="relative min-w-0">
                <pre className="bg-muted max-h-40 w-full overflow-auto rounded-md p-3 pr-16 font-mono text-xs break-all whitespace-pre-wrap">
                  {JSON.stringify(exportData.claudeSettings, null, 2)}
                </pre>
                <button
                  type="button"
                  onClick={() => void copySettingsJson()}
                  className="bg-popover absolute end-2 top-2 inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs transition-colors hover:bg-muted"
                >
                  {copied ? (
                    <CheckIcon className="text-emerald-500 size-3" />
                  ) : (
                    <CopyIcon className="size-3" />
                  )}
                  {copied ? tc("confirm") : t("copyJson")}
                </button>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={downloadBackup}
              >
                <DownloadIcon className="size-3.5" />
                {t("exportDownload")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{tc("delete")}</DialogTitle>
            <DialogDescription>
              {t("deleteProviderConfirm", { name: deleteTarget?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {tc("cancel")}
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()}>
              {tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
