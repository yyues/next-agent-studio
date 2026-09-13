"use client";

import { useCallback, useEffect, useState, type FC } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
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
  BotIcon,
  ChevronRightIcon,
  Loader2Icon,
  PlusIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

/**
 * 角色面板(统一设置页 /settings 的「角色管理」标签):
 * 说明 + 主 CTA → 内置角色卡片 → 自定义角色卡片(空状态引导)。
 * 卡片风格与供应商面板一致(图标块 + 徽章 + 描述 + stagger 入场)。
 */
export const RolesPanel: FC = () => {
  const t = useTranslations("roles");
  const tc = useTranslations("common");
  const router = useRouter();
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<RoleForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    try {
      const userId = getClientRuntimeContext().userId;
      const res = await fetch(
        `/api/settings/roles?userId=${encodeURIComponent(userId)}`,
      );
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as { roles: RoleItem[] };
      setRoles(data.roles);
    } catch {
      setMessage({ type: "error", text: t("loadFailed") });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  const openCreate = () => {
    setForm(emptyForm);
    setMessage(null);
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    if (saving) return;
    if (!form.roleId.trim() || !form.displayName.trim()) {
      setMessage({ type: "error", text: t("missingFields") });
      return;
    }
    setSaving(true);
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
      setDialogOpen(false);
      router.push(`/settings/roles/${encodeURIComponent(form.roleId.trim())}`);
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : t("saveFailed"),
      });
    } finally {
      setSaving(false);
    }
  };

  const builtinRoles = roles.filter((r) => builtinRoleIds.has(r.roleId));
  const customRoles = roles.filter((r) => !builtinRoleIds.has(r.roleId));

  return (
    <div>
      {/* 面板头:模块说明 + 主 CTA */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
          {t("subtitle")}
        </p>
        <Button className="gap-1.5" onClick={openCreate}>
          <PlusIcon className="size-4" />
          {t("create")}
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

      {loading ? (
        <div className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
          <Loader2Icon className="size-4 animate-spin" />
          {tc("loading")}
        </div>
      ) : (
        <>
          <section className="mb-8">
            <h2 className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
              {t("builtin")}
            </h2>
            <div className="grid gap-2.5">
              {builtinRoles.map((role, i) => (
                <RoleCard
                  key={role.roleId}
                  role={role}
                  builtin
                  index={i}
                  t={t}
                />
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
              {t("custom")}
            </h2>
            {customRoles.length === 0 ? (
              /* 空状态:引导创建第一个自定义角色(与供应商空状态同款) */
              <button
                type="button"
                onClick={openCreate}
                className="hover:border-primary/40 hover:bg-primary/5 aui-lift group mt-1 flex w-full cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed border-border py-14 text-center transition-colors"
              >
                <span className="bg-primary/10 text-primary group-hover:scale-105 flex size-12 items-center justify-center rounded-full transition-transform duration-200 motion-reduce:transition-none motion-reduce:transform-none">
                  <BotIcon className="size-5" />
                </span>
                <span className="text-foreground text-sm font-medium">
                  {t("noCustomRoles")}
                </span>
                <span className="text-muted-foreground max-w-xs text-xs leading-relaxed">
                  {t("noCustomRolesHint")}
                </span>
                <span className="text-primary mt-1 inline-flex items-center gap-1 text-xs font-medium">
                  <PlusIcon className="size-3.5" />
                  {t("create")}
                </span>
              </button>
            ) : (
              <div className="grid gap-2.5">
                {customRoles.map((role, i) => (
                  <RoleCard
                    key={role.roleId}
                    role={role}
                    builtin={false}
                    index={i}
                    t={t}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* 新建角色弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("create")}</DialogTitle>
            <DialogDescription />
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-foreground text-sm font-medium">
                {t("roleId")}
              </span>
              <input
                value={form.roleId}
                autoComplete="off"
                onChange={(e) =>
                  setForm((p) => ({ ...p, roleId: e.target.value }))
                }
                className="bg-background border-input focus-visible:border-primary focus-visible:ring-primary/30 h-11 rounded-md border px-3 text-sm outline-none transition-colors focus-visible:ring-2"
                placeholder={t("roleIdPlaceholder")}
                disabled={saving}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-foreground text-sm font-medium">
                {t("displayName")}
              </span>
              <input
                value={form.displayName}
                autoComplete="off"
                onChange={(e) =>
                  setForm((p) => ({ ...p, displayName: e.target.value }))
                }
                className="bg-background border-input focus-visible:border-primary focus-visible:ring-primary/30 h-11 rounded-md border px-3 text-sm outline-none transition-colors focus-visible:ring-2"
                placeholder={t("displayNamePlaceholder")}
                disabled={saving}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-foreground text-sm font-medium">
                {t("systemPrompt")}
              </span>
              <textarea
                value={form.systemPrompt}
                autoComplete="off"
                onChange={(e) =>
                  setForm((p) => ({ ...p, systemPrompt: e.target.value }))
                }
                className="bg-background border-input focus-visible:border-primary focus-visible:ring-primary/30 min-h-24 rounded-md border px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2"
                placeholder={t("systemPromptPlaceholder")}
                disabled={saving}
                rows={4}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5">
                <span className="text-foreground text-sm font-medium">
                  {t("priority")}
                </span>
                <input
                  type="number"
                  value={form.priority}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, priority: Number(e.target.value) }))
                  }
                  className="bg-background border-input focus-visible:border-primary focus-visible:ring-primary/30 h-11 rounded-md border px-3 text-sm outline-none transition-colors focus-visible:ring-2"
                  disabled={saving}
                />
              </label>
              <label className="flex items-center gap-2 self-end pb-2">
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
            <Button onClick={() => void handleCreate()} disabled={saving}>
              {saving && <Loader2Icon className="size-3.5 animate-spin" />}
              {saving ? t("saving") : tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const RoleCard: FC<{
  role: RoleItem;
  builtin: boolean;
  index: number;
  t: (key: string) => string;
}> = ({ role, builtin, index, t }) => {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() =>
        router.push(`/settings/roles/${encodeURIComponent(role.roleId)}`)
      }
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
      className="aui-anim-item aui-lift group border-border/60 bg-card hover:border-primary/30 flex w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors"
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          builtin
            ? "bg-muted text-muted-foreground"
            : "bg-primary/10 text-primary",
        )}
      >
        {builtin ? (
          <ShieldCheckIcon className="size-4" />
        ) : (
          <BotIcon className="size-4" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{role.displayName}</span>
          <span className="text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
            {role.roleId}
          </span>
          {builtin && (
            <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-xs text-blue-500">
              {t("builtin")}
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs",
              role.enabled
                ? "bg-emerald-500/10 text-emerald-500"
                : "bg-muted text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "size-1 rounded-full",
                role.enabled ? "bg-emerald-500" : "bg-muted-foreground/60",
              )}
            />
            {role.enabled ? t("enabled") : t("disabled")}
          </span>
        </span>
        <span className="text-muted-foreground mt-1 block truncate text-xs">
          {role.description || role.systemPrompt || "—"}
        </span>
      </span>
      <ChevronRightIcon className="text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 size-4 shrink-0 transition-all duration-200 motion-reduce:transition-none" />
    </button>
  );
};
