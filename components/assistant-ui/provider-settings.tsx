"use client";

import { useEffect, useState, type FC } from "react";
import { useTranslations } from "next-intl";
import { Settings2Icon } from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  saveProviderLocal,
  loadProviderLocal,
  type ProviderConfig,
} from "@/lib/provider-storage";
import { getClientRuntimeContext } from "@/lib/client-runtime-context";

const defaultForm: ProviderConfig = {
  providerName: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-5.6-luna",
};

export const ProviderSettingsButton: FC = () => {
  const t = useTranslations("settings");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState<ProviderConfig>(defaultForm);
  const [maskedApiKey, setMaskedApiKey] = useState("");
  const [storedApiKey, setStoredApiKey] = useState("");  // 保留原始 key 用于测试连接
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setMessage("");
      setMessageType("");

      try {
        const userId = getClientRuntimeContext().userId;
        // 优先从数据库加载（用户已保存过配置）
        const res = await fetch(
          `/api/settings/provider?userId=${encodeURIComponent(userId)}`,
        );
        if (res.ok) {
          const data = (await res.json()) as {
            providerName: string;
            baseUrl: string;
            model: string;
            maskedApiKey: string;
          };
          if (cancelled) return;
          setMaskedApiKey(data.maskedApiKey ?? "");
          setForm({
            providerName: data.providerName,
            baseUrl: data.baseUrl,
            apiKey: "",
            model: data.model,
          });
        }
      } catch {
        // 数据库不可用，回退到本地加密存储
      }

      try {
        const local = await loadProviderLocal();
        if (cancelled) return;
        if (local) {
          setForm({ ...local, apiKey: "" });
          setMaskedApiKey(local.apiKey ? "********" : "");
          setStoredApiKey(local.apiKey || "");
        }
      } catch {
        // 本地存储也不可用，使用默认值
      }

      if (!cancelled) setLoading(false);
    };

    void load();
    return () => { cancelled = true; };
  }, [open]);

  const saveSettings = async () => {
    setSaving(true);
    setMessage("");
    setMessageType("");

    try {
      const userId = getClientRuntimeContext().userId;
      const res = await fetch("/api/settings/provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          providerName: form.providerName,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey || storedApiKey,
          model: form.model,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { maskedApiKey: string };
        setMaskedApiKey(data.maskedApiKey ?? maskedApiKey);
      }

      // 同时加密保存到本地（作为备份/未登录时使用）
      await saveProviderLocal({
        providerName: form.providerName,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey || "",
        model: form.model,
      });

      setForm((prev) => ({ ...prev, apiKey: "" }));
      setMessage(t("saved"));
      setMessageType("success");
      setOpen(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("saveFailed"));
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setMessage("");
    setMessageType("");

    try {
      const userId = getClientRuntimeContext().userId;
      const res = await fetch("/api/settings/provider/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          providerName: form.providerName,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey || storedApiKey,
          model: form.model,
        }),
      });

      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || t("testFailed"));

      setMessage(t("testSuccess"));
      setMessageType("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("testFailed"));
      setMessageType("error");
    } finally {
      setTesting(false);
    }
  };

  const disabled = loading || saving || testing;

  return (
    <>
      <TooltipIconButton
        tooltip={t("tooltip")}
        side="bottom"
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-foreground hover:bg-muted-foreground/15 dark:border-muted-foreground/15 dark:hover:bg-muted-foreground/30 size-7 rounded-full active:scale-[0.96] motion-reduce:transition-none"
        aria-label={t("tooltip")}
        onClick={() => setOpen(true)}
      >
        <Settings2Icon className="size-4" />
      </TooltipIconButton>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">{t("providerName")}</span>
              <input
                value={form.providerName}
                onChange={(e) => setForm((p) => ({ ...p, providerName: e.target.value }))}
                className="bg-background border-input h-9 rounded-md border px-2.5 text-sm outline-none"
                placeholder="openai-compatible"
                disabled={disabled}
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">{t("baseUrl")}</span>
              <input
                value={form.baseUrl}
                onChange={(e) => setForm((p) => ({ ...p, baseUrl: e.target.value }))}
                className="bg-background border-input h-9 rounded-md border px-2.5 text-sm outline-none"
                placeholder="https://api.openai.com/v1"
                disabled={disabled}
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">{t("apiKey")}</span>
              <input
                value={form.apiKey}
                onChange={(e) => setForm((p) => ({ ...p, apiKey: e.target.value }))}
                className="bg-background border-input h-9 rounded-md border px-2.5 text-sm outline-none"
                placeholder={maskedApiKey || t("enterKey")}
                type="password"
                autoComplete="off"
                disabled={disabled}
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">{t("model")}</span>
              <input
                value={form.model}
                onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))}
                className="bg-background border-input h-9 rounded-md border px-2.5 text-sm outline-none"
                placeholder="gpt-5.6-luna"
                disabled={disabled}
              />
            </label>

            {message && (
              <p className={messageType === "error" ? "text-destructive text-xs" : "text-emerald-500 text-xs"}>
                {message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={testConnection} disabled={disabled}>
              {testing ? t("testing") : t("test")}
            </Button>
            <Button onClick={saveSettings} disabled={disabled}>
              {saving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
