"use client";

import { useCallback, useEffect, useState, type FC } from "react";
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
import { ArrowLeftIcon, PlusIcon, ShieldCheckIcon, UserIcon } from "lucide-react";

type RoleItem = {
  roleId: string;
  displayName: string;
  description?: string;
  enabled: boolean;
  systemPrompt: string;
  skillIds: string[];
  priority: number;
};

type RoleForm = {
  roleId: string;
  displayName: string;
  systemPrompt: string;
  enabled: boolean;
  priority: number;
};

const emptyForm: RoleForm = {
  roleId: "",
  displayName: "",
  systemPrompt: "",
  enabled: true,
  priority: 10,
};

const builtinRoleIds = new Set(["general", "developer", "analyst"]);

export default function RolesPage() {
  const t = useTranslations("roles");
  const tc = useTranslations("common");
  const router = useRouter();
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<RoleForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  const loadRoles = useCallback(async () => {
    setLoading(true);
    try {
      const userId = getClientRuntimeContext().userId;
      const res = await fetch(
        `/api/settings/roles?userId=${encodeURIComponent(userId)}`,
      );
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { roles: RoleItem[] };
      setRoles(data.roles);
    } catch {
      setMessage(t("saveFailed"));
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  const openCreate = () => {
    setForm(emptyForm);
    setMessage("");
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    setSaving(true);
    setMessage("");
    setMessageType("");
    try {
      const userId = getClientRuntimeContext().userId;
      const res = await fetch("/api/settings/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          roleId: form.roleId,
          displayName: form.displayName,
          systemPrompt: form.systemPrompt,
          enabled: form.enabled,
          priority: form.priority,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error || t("saveFailed"));
      }
      setMessageType("success");
      setDialogOpen(false);
      router.push(`/admin/roles/${encodeURIComponent(form.roleId.trim())}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("saveFailed"));
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  };

  const builtinRoles = roles.filter((r) => builtinRoleIds.has(r.roleId));
  const customRoles = roles.filter((r) => !builtinRoleIds.has(r.roleId));

  return (
    <div className="bg-background text-foreground min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeftIcon className="size-4" />
            {t("backToChat")}
          </Link>
        </div>

        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("title")}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("subtitle")}
            </p>
          </div>
          <Button onClick={openCreate} className="gap-1.5">
            <PlusIcon className="size-4" />
            {t("create")}
          </Button>
        </div>

        {message && (
          <p
            className={`mb-4 text-sm ${messageType === "error" ? "text-destructive" : "text-emerald-500"}`}
          >
            {message}
          </p>
        )}

        {loading ? (
          <p className="text-muted-foreground text-sm">{tc("loading")}</p>
        ) : (
          <>
            <section className="mb-8">
              <h2 className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wider">
                {t("builtin")}
              </h2>
              <div className="grid gap-3">
                {builtinRoles.map((role) => (
                  <RoleCard key={role.roleId} role={role} builtin t={t} />
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wider">
                {t("custom")}
              </h2>
              {customRoles.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t("noCustomRoles")}
                </p>
              ) : (
                <div className="grid gap-3">
                  {customRoles.map((role) => (
                    <RoleCard key={role.roleId} role={role} builtin={false} t={t} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("create")}</DialogTitle>
            <DialogDescription />
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("roleId")}
              </span>
              <input
                value={form.roleId}
                onChange={(e) =>
                  setForm((p) => ({ ...p, roleId: e.target.value }))
                }
                className="bg-background border-input h-9 rounded-md border px-2.5 text-sm outline-none"
                placeholder={t("roleIdPlaceholder")}
                disabled={saving}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("displayName")}
              </span>
              <input
                value={form.displayName}
                onChange={(e) =>
                  setForm((p) => ({ ...p, displayName: e.target.value }))
                }
                className="bg-background border-input h-9 rounded-md border px-2.5 text-sm outline-none"
                placeholder={t("displayNamePlaceholder")}
                disabled={saving}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs text-muted-foreground">
                {t("systemPrompt")}
              </span>
              <textarea
                value={form.systemPrompt}
                onChange={(e) =>
                  setForm((p) => ({ ...p, systemPrompt: e.target.value }))
                }
                className="bg-background border-input min-h-24 rounded-md border px-2.5 py-2 text-sm outline-none"
                placeholder={t("systemPromptPlaceholder")}
                disabled={saving}
                rows={4}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5">
                <span className="text-xs text-muted-foreground">
                  {t("priority")}
                </span>
                <input
                  type="number"
                  value={form.priority}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      priority: Number(e.target.value),
                    }))
                  }
                  className="bg-background border-input h-9 rounded-md border px-2.5 text-sm outline-none"
                  disabled={saving}
                />
              </label>
              <label className="flex items-center gap-2 self-end pb-1">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, enabled: e.target.checked }))
                  }
                  disabled={saving}
                  className="size-4"
                />
                <span className="text-sm">{t("enabled")}</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              {tc("cancel")}
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? tc("loading") : tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const RoleCard: FC<{
  role: RoleItem;
  builtin: boolean;
  t: (key: string) => string;
}> = ({ role, builtin, t }) => {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.push(`/admin/roles/${encodeURIComponent(role.roleId)}`)}
      className="border-border/60 bg-card hover:bg-accent/50 flex w-full items-start justify-between gap-4 rounded-lg border p-4 text-left transition-colors cursor-pointer"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {builtin ? (
            <ShieldCheckIcon className="text-muted-foreground size-4 shrink-0" />
          ) : (
            <UserIcon className="text-muted-foreground size-4 shrink-0" />
          )}
          <span className="font-medium">{role.displayName}</span>
          <span className="text-muted-foreground bg-muted rounded px-1.5 py-0.5 text-xs">
            {role.roleId}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${
              builtin
                ? "bg-blue-500/10 text-blue-500"
                : "bg-emerald-500/10 text-emerald-500"
            }`}
          >
            {builtin ? t("builtin") : t("custom")}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${
              role.enabled
                ? "bg-emerald-500/10 text-emerald-500"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {role.enabled ? t("enabled") : t("disabled")}
          </span>
        </div>
        <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
          {role.description || role.systemPrompt}
        </p>
      </div>
    </button>
  );
};
