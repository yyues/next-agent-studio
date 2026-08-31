"use client";

import { useEffect, useState, type FC } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  saveProviderLocal,
  loadProviderLocal,
  type ProviderConfig,
} from "@/lib/provider-storage";
import { getClientRuntimeContext } from "@/lib/client-runtime-context";

const defaultForm: ProviderConfig & { temperature: number } = {
  providerName: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-5.6-luna",
  embeddingModel: "text-embedding-3-small",
  embeddingBaseUrl: "",
  embeddingApiKey: "",
  temperature: 0.7,
};

const ProviderSettingsPage: FC = () => {
  const t = useTranslations("settings");
  const tr = useTranslations("roles");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [maskedApiKey, setMaskedApiKey] = useState("");
  const [storedApiKey, setStoredApiKey] = useState(""); // 保留原始 key 用于测试连接
  const [maskedEmbeddingApiKey, setMaskedEmbeddingApiKey] = useState("");
  const [storedEmbeddingApiKey, setStoredEmbeddingApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setMessage("");
      setMessageType("");

      try {
        const userId = getClientRuntimeContext().userId;
        const res = await fetch(
          `/api/settings/provider?userId=${encodeURIComponent(userId)}`,
        );
        if (res.ok) {
          const data = (await res.json()) as {
            providerName: string;
            baseUrl: string;
            model: string;
            embeddingModel?: string;
            embeddingBaseUrl?: string;
            temperature?: number;
            maskedApiKey: string;
            maskedEmbeddingApiKey?: string;
          };
          if (cancelled) return;
          setMaskedApiKey(data.maskedApiKey ?? "");
          setMaskedEmbeddingApiKey(data.maskedEmbeddingApiKey ?? "");
          setForm({
            providerName: data.providerName,
            baseUrl: data.baseUrl,
            apiKey: "",
            model: data.model,
            embeddingModel:
              data.embeddingModel || defaultForm.embeddingModel,
            embeddingBaseUrl:
              data.embeddingBaseUrl ?? defaultForm.embeddingBaseUrl,
            embeddingApiKey: "",
            temperature:
              typeof data.temperature === "number"
                ? data.temperature
                : defaultForm.temperature,
          });
        }
      } catch {
        // 数据库不可用，回退到本地加密存储
      }

      try {
        const local = await loadProviderLocal();
        if (cancelled) return;
        if (local) {
          setForm((prev) => ({
            ...prev,
            ...local,
            apiKey: "",
            embeddingApiKey: "",
            temperature:
              typeof local.temperature === "number"
                ? local.temperature
                : prev.temperature,
          }));
          setMaskedApiKey(local.apiKey ? "********" : "");
          setStoredApiKey(local.apiKey || "");
          setMaskedEmbeddingApiKey(local.embeddingApiKey ? "********" : "");
          setStoredEmbeddingApiKey(local.embeddingApiKey || "");
        }
      } catch {
        // 本地存储也不可用，使用默认值
      }

      if (!cancelled) setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

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
          embeddingModel: form.embeddingModel,
          embeddingBaseUrl: form.embeddingBaseUrl,
          embeddingApiKey: form.embeddingApiKey || storedEmbeddingApiKey,
          temperature: form.temperature,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          maskedApiKey: string;
          maskedEmbeddingApiKey?: string;
        };
        setMaskedApiKey(data.maskedApiKey ?? maskedApiKey);
        setMaskedEmbeddingApiKey(
          data.maskedEmbeddingApiKey ?? maskedEmbeddingApiKey,
        );
      }

      // 同时加密保存到本地（作为备份/未登录时使用）
      await saveProviderLocal({
        providerName: form.providerName,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey || "",
        model: form.model,
        embeddingModel: form.embeddingModel,
        embeddingBaseUrl: form.embeddingBaseUrl,
        embeddingApiKey: form.embeddingApiKey || "",
        temperature: form.temperature,
      });

      setForm((prev) => ({ ...prev, apiKey: "", embeddingApiKey: "" }));
      setMessage(t("saved"));
      setMessageType("success");
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
    <div className="bg-background text-foreground min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeftIcon className="size-4" />
            {tr("backToChat")}
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("description")}
          </p>
        </div>

        {message && (
          <p
            className={`mb-4 text-sm ${
              messageType === "error" ? "text-destructive" : "text-emerald-500"
            }`}
          >
            {message}
          </p>
        )}

        {loading ? (
          <p className="text-muted-foreground text-sm">…</p>
        ) : (
          <div className="grid gap-4">
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("providerName")}
              </span>
              <input
                value={form.providerName}
                onChange={(e) =>
                  setForm((p) => ({ ...p, providerName: e.target.value }))
                }
                className="bg-background border-input h-9 rounded-md border px-2.5 text-sm outline-none"
                placeholder="openai-compatible"
                disabled={disabled}
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("baseUrl")}
              </span>
              <input
                value={form.baseUrl}
                onChange={(e) =>
                  setForm((p) => ({ ...p, baseUrl: e.target.value }))
                }
                className="bg-background border-input h-9 rounded-md border px-2.5 text-sm outline-none"
                placeholder="https://api.openai.com/v1"
                disabled={disabled}
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("apiKey")}
              </span>
              <input
                value={form.apiKey}
                onChange={(e) =>
                  setForm((p) => ({ ...p, apiKey: e.target.value }))
                }
                className="bg-background border-input h-9 rounded-md border px-2.5 text-sm outline-none"
                placeholder={maskedApiKey || t("enterKey")}
                type="text"
                autoComplete="off"
                disabled={disabled}
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("model")}
              </span>
              <input
                value={form.model}
                onChange={(e) =>
                  setForm((p) => ({ ...p, model: e.target.value }))
                }
                className="bg-background border-input h-9 rounded-md border px-2.5 text-sm outline-none"
                placeholder="gpt-5.6-luna"
                disabled={disabled}
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("embeddingModel")}
              </span>
              <input
                value={form.embeddingModel}
                onChange={(e) =>
                  setForm((p) => ({ ...p, embeddingModel: e.target.value }))
                }
                className="bg-background border-input h-9 rounded-md border px-2.5 text-sm outline-none"
                placeholder="text-embedding-3-small"
                disabled={disabled}
              />
              <span className="text-muted-foreground text-[11px]">
                {t("embeddingModelHint")}
              </span>
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("embeddingBaseUrl")}
              </span>
              <input
                value={form.embeddingBaseUrl}
                onChange={(e) =>
                  setForm((p) => ({ ...p, embeddingBaseUrl: e.target.value }))
                }
                className="bg-background border-input h-9 rounded-md border px-2.5 text-sm outline-none"
                placeholder={t("embeddingBaseUrlPlaceholder")}
                disabled={disabled}
              />
              <span className="text-muted-foreground text-[11px]">
                {t("embeddingBaseUrlHint")}
              </span>
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("embeddingApiKey")}
              </span>
              <input
                value={form.embeddingApiKey}
                onChange={(e) =>
                  setForm((p) => ({ ...p, embeddingApiKey: e.target.value }))
                }
                className="bg-background border-input h-9 rounded-md border px-2.5 text-sm outline-none"
                placeholder={maskedEmbeddingApiKey || t("enterKey")}
                type="text"
                autoComplete="off"
                disabled={disabled}
              />
              <span className="text-muted-foreground text-[11px]">
                {t("embeddingApiKeyHint")}
              </span>
            </label>

            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {t("temperature")}
                </span>
                <span className="text-foreground text-xs font-medium tabular-nums">
                  {form.temperature.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={form.temperature}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    temperature: Number(e.target.value),
                  }))
                }
                className="accent-primary h-2 w-full cursor-pointer"
                disabled={disabled}
              />
              <div className="text-muted-foreground flex justify-between text-[10px]">
                <span>0（精确）</span>
                <span>0.7</span>
                <span>2（发散）</span>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={testConnection} disabled={disabled}>
            {testing ? t("testing") : t("test")}
          </Button>
          <Button onClick={saveSettings} disabled={disabled}>
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProviderSettingsPage;
