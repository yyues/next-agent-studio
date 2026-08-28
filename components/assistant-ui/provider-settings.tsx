"use client";

import { useEffect, useMemo, useState, type FC } from "react";
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
  getClientRuntimeContext,
  setClientRuntimeContext,
} from "@/lib/client-runtime-context";

type RoleItem = {
  roleId: string;
  displayName: string;
  enabled: boolean;
  skillIds: string[];
};

type ProviderForm = {
  userId: string;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  roleId: string;
};

const defaultForm: ProviderForm = {
  userId: "demo-user",
  providerName: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-5.6-luna",
  roleId: "general",
};

export const ProviderSettingsButton: FC = () => {
  const t = useTranslations("settings");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState<ProviderForm>(defaultForm);
  const [maskedApiKey, setMaskedApiKey] = useState("");
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [message, setMessage] = useState<string>("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  const roleOptions = useMemo(
    () => roles.filter((role) => role.enabled),
    [roles],
  );

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setMessage("");
      setMessageType("");

      try {
        const runtime = getClientRuntimeContext();

        const [providerRes, rolesRes] = await Promise.all([
          fetch(`/api/settings/provider?userId=${encodeURIComponent(runtime.userId)}`),
          fetch(`/api/settings/roles?userId=${encodeURIComponent(runtime.userId)}`),
        ]);

        if (!providerRes.ok) throw new Error(await providerRes.text());
        if (!rolesRes.ok) throw new Error(await rolesRes.text());

        const providerData = (await providerRes.json()) as {
          userId: string;
          providerName: string;
          baseUrl: string;
          model: string;
          maskedApiKey: string;
        };
        const rolesData = (await rolesRes.json()) as {
          currentRoleId: string;
          roles: RoleItem[];
        };

        if (cancelled) return;

        const selectedRoleId =
          rolesData.currentRoleId || runtime.roleId || defaultForm.roleId;

        setRoles(rolesData.roles);
        setMaskedApiKey(providerData.maskedApiKey ?? "");
        setForm({
          userId: providerData.userId || runtime.userId,
          providerName: providerData.providerName,
          baseUrl: providerData.baseUrl,
          apiKey: "",
          model: providerData.model,
          roleId: selectedRoleId,
        });

        setClientRuntimeContext({
          userId: providerData.userId || runtime.userId,
          roleId: selectedRoleId,
        });
      } catch (error) {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : t("loadFailed"));
        setMessageType("error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [open, t]);

  const saveSettings = async () => {
    setSaving(true);
    setMessage("");
    setMessageType("");

    try {
      const providerRes = await fetch("/api/settings/provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: form.userId,
          providerName: form.providerName,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          model: form.model,
        }),
      });
      if (!providerRes.ok) throw new Error(await providerRes.text());

      const roleRes = await fetch("/api/settings/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: form.userId, roleId: form.roleId }),
      });
      if (!roleRes.ok) throw new Error(await roleRes.text());

      const providerData = (await providerRes.json()) as { maskedApiKey: string };
      setMaskedApiKey(providerData.maskedApiKey ?? maskedApiKey);
      setForm((prev) => ({ ...prev, apiKey: "" }));
      setClientRuntimeContext({ userId: form.userId, roleId: form.roleId });
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
      const res = await fetch("/api/settings/provider/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: form.userId,
          providerName: form.providerName,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
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
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">{t("userId")}</span>
              <input
                value={form.userId}
                onChange={(e) => setForm((p) => ({ ...p, userId: e.target.value }))}
                className="bg-background border-input h-9 rounded-md border px-2.5 text-sm outline-none"
                placeholder="demo-user"
                disabled={disabled}
              />
            </label>

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

            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">{t("role")}</span>
              <select
                value={form.roleId}
                onChange={(e) => setForm((p) => ({ ...p, roleId: e.target.value }))}
                className="bg-background border-input h-9 rounded-md border px-2.5 text-sm outline-none"
                disabled={disabled || roleOptions.length === 0}
              >
                {roleOptions.map((role) => (
                  <option key={role.roleId} value={role.roleId}>
                    {role.displayName}
                  </option>
                ))}
              </select>
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
