"use client";

import { useCallback, useEffect, useState, type FC } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { BotIcon, Loader2Icon, PlusIcon } from "lucide-react";
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
import { useRolesStore, type RoleSummary } from "@/lib/roles-store";
import { cn } from "@/lib/utils";
import { RoleDetail } from "@/components/settings/role-detail";

type RoleItem = {
  roleId: string;
  displayName: string;
  description?: string;
  enabled: boolean;
};

type RoleForm = {
  displayName: string;
  systemPrompt: string;
  enabled: boolean;
  priority: number;
};

const emptyForm: RoleForm = {
  displayName: "",
  systemPrompt: "",
  enabled: true,
  priority: 10,
};

/** 与 lib/server-settings 的 defaultRoleProfiles 保持一致 */
const builtinRoleIds = new Set(["general", "developer"]);

/**
 * 角色双栏工作区:左栏角色列表(内置/自定义分组 + 新建),右栏选中角色详情。
 * 选中态同步到 URL ?role=(replace,保留深链);移动端列表/详情互斥切换。
 */
export const RolesWorkspace: FC<{ initialRoleId?: string }> = ({
  initialRoleId,
}) => {
  const t = useTranslations("roles");
  const tc = useTranslations("common");
  const router = useRouter();

  const [selectedId, setSelectedId] = useState<string | null>(
    initialRoleId ?? null,
  );

  /* 角色列表来自共享缓存(lib/roles-store):切标签 remount 后零请求,
   * CRUD 由写接口响应直接驱动更新 */
  const roles = useRolesStore((s) => s.roles);
  const loading = useRolesStore((s) => s.loading);
  const loadFailed = useRolesStore((s) => s.loadFailed);
  const fetchedAt = useRolesStore((s) => s.fetchedAt);
  const ensureRoles = useRolesStore((s) => s.ensureRoles);
  const applyRoleCreated = useRolesStore((s) => s.applyRoleCreated);
  const applyRoleDeleted = useRolesStore((s) => s.applyRoleDeleted);

  /* 新建角色弹窗(roleId 由服务端自动生成,表单不再收集) */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<RoleForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    void ensureRoles();
  }, [ensureRoles]);

  useEffect(() => {
    if (loadFailed) setMessage({ type: "error", text: t("loadFailed") });
  }, [loadFailed, t]);

  /* 列表到达后(首次或 CRUD 更新后)修正选中项:保留仍存在的当前选中,
   * 否则依次回退 URL 深链 → 当前会话角色 → 第一个 */
  useEffect(() => {
    if (roles.length === 0) return;
    setSelectedId((prev) => {
      if (prev && roles.some((r) => r.roleId === prev)) return prev;
      if (initialRoleId && roles.some((r) => r.roleId === initialRoleId)) {
        return initialRoleId;
      }
      const ctx = getClientRuntimeContext();
      return (
        roles.find((r) => r.roleId === ctx.roleId)?.roleId ??
        roles[0]?.roleId ??
        null
      );
    });
  }, [roles, initialRoleId]);

  /* 首次回源完成前显示 loading;失败后不空转 spinner(展示错误横幅) */
  const listLoading = loading || (fetchedAt === null && !loadFailed);

  /* 选中同步 URL(replace 不产生历史噪音,刷新/分享仍可还原) */
  const select = useCallback(
    (roleId: string | null) => {
      setSelectedId(roleId);
      const url = roleId
        ? `/settings?tab=roles&role=${encodeURIComponent(roleId)}`
        : "/settings?tab=roles";
      router.replace(url, { scroll: false });
    },
    [router],
  );

  const handleCreate = async () => {
    if (saving) return;
    if (!form.displayName.trim()) {
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
      const data = (await res.json()) as { role: RoleSummary };
      setDialogOpen(false);
      setForm(emptyForm);
      applyRoleCreated(data.role);
      select(data.role.roleId);
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : t("saveFailed"),
      });
    } finally {
      setSaving(false);
    }
  };

  const onDeleted = useCallback(
    (deletedRoleId: string) => {
      setSelectedId(null);
      applyRoleDeleted(deletedRoleId);
    },
    [applyRoleDeleted],
  );

  const builtin = roles.filter((r) => builtinRoleIds.has(r.roleId));
  const custom = roles.filter((r) => !builtinRoleIds.has(r.roleId));

  const renderRow = (role: RoleItem) => {
    const active = role.roleId === selectedId;
    return (
      <button
        key={role.roleId}
        type="button"
        onClick={() => select(role.roleId)}
        className={cn(
          "group relative flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start text-sm transition-colors duration-150",
          active
            ? "bg-primary/10 text-primary font-medium"
            : "hover:bg-muted text-foreground/90",
        )}
      >
        {active && (
          <span className="bg-primary absolute start-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full" />
        )}
        <span className="min-w-0 flex-1 truncate">{role.displayName}</span>
        {!role.enabled && (
          <span className="bg-muted text-muted-foreground rounded px-1 py-0.5 text-[10px]">
            {t("disabled")}
          </span>
        )}
      </button>
    );
  };

  return (
    <div>
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

      <div className="flex gap-6">
        {/* 左栏:角色列表(移动端选中详情时隐藏;桌面端滚动吸顶,列表过长自身滚动) */}
        <aside
          className={cn(
            "w-full shrink-0 md:w-60",
            "md:sticky md:top-[3.75rem] md:self-start md:max-h-[calc(100dvh-5rem)] md:overflow-y-auto md:pb-2",
            selectedId && "hidden md:block",
          )}
        >
          <Button
            className="mb-3 w-full gap-1.5"
            size="sm"
            onClick={() => setDialogOpen(true)}
          >
            <PlusIcon className="size-3.5" />
            {t("create")}
          </Button>

          {listLoading ? (
            <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
              <Loader2Icon className="size-4 animate-spin" />
              {tc("loading")}
            </div>
          ) : roles.length === 0 ? (
            <p className="text-muted-foreground px-2 py-6 text-xs">
              {t("noCustomRolesHint")}
            </p>
          ) : (
            <div className="grid gap-3">
              {builtin.length > 0 && (
                <section>
                  <h3 className="text-muted-foreground mb-1 px-2.5 text-[11px] font-medium tracking-wider uppercase">
                    {t("builtin")}
                  </h3>
                  <div className="grid gap-0.5">{builtin.map(renderRow)}</div>
                </section>
              )}
              {custom.length > 0 && (
                <section>
                  <h3 className="text-muted-foreground mb-1 px-2.5 text-[11px] font-medium tracking-wider uppercase">
                    {t("custom")}
                  </h3>
                  <div className="grid gap-0.5">{custom.map(renderRow)}</div>
                </section>
              )}
            </div>
          )}
        </aside>

        {/* 右栏:选中角色详情(移动端未选中时隐藏) */}
        <div
          className={cn(
            "min-w-0 flex-1",
            !selectedId && "hidden md:block",
          )}
        >
          {selectedId ? (
            <RoleDetail
              key={selectedId}
              roleId={selectedId}
              onDeleted={onDeleted}
              onMobileBack={() => select(null)}
            />
          ) : (
            <div className="border-border/60 bg-card text-muted-foreground flex min-h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-14 text-center text-sm">
              <BotIcon className="size-5 opacity-50" />
              {t("selectRoleHint")}
            </div>
          )}
        </div>
      </div>

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
