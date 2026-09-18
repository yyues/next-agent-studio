"use client";

import { useEffect, useMemo, useState, type FC } from "react";
import { useTranslations } from "next-intl";
import { GlobeIcon, Loader2Icon } from "lucide-react";
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

/**
 * "从库中选择"多选弹窗:可选池 = 全局库 + 自己的其他角色
 * (GET /api/settings/library,已排除当前角色)。
 * 保存 = 整体替换角色的引用列表(PUT /api/settings/roles/[roleId]
 * 的 skillIds / mcpRefs 字段);取消勾选即移除引用。
 */

type LibraryItem = {
  key: string;
  title: string;
  description: string;
  version?: string;
  url?: string;
  source: "global" | "role";
  roleName: string | null;
};

export const LibraryPicker: FC<{
  kind: "skill" | "mcp";
  roleId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 当前已启用的引用键(勾选态初始值) */
  selected: string[];
  onSaved: () => void;
}> = ({ kind, roleId, open, onOpenChange, selected, onSaved }) => {
  const t = useTranslations("roles");
  const tc = useTranslations("common");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set(selected));

  useEffect(() => {
    if (!open) return;
    setChecked(new Set(selected));
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/settings/library?excludeRoleId=${encodeURIComponent(roleId)}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          skills?: Array<LibraryItem & { skillId: string }>;
          mcps?: Array<LibraryItem & { serverId: string }>;
      };
        const list =
          kind === "skill"
            ? (data.skills ?? []).map((s) => ({
                key: s.key,
                title: s.title,
                description: s.description ?? "",
                version: s.version,
                source: s.source,
                roleName: s.roleName,
              }))
            : (data.mcps ?? []).map((m) => ({
                key: m.key,
                title: m.title,
                description: m.url ?? "",
                source: m.source,
                roleName: m.roleName,
              }));
        setItems(list);
      } catch {
        // 静默:保留空列表
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, roleId]);

  // 分组:全局库在前,角色组按名排序
  const groups = useMemo(() => {
    const global = items.filter((i) => i.source === "global");
    const byRole = new Map<string, LibraryItem[]>();
    for (const item of items) {
      if (item.source !== "role") continue;
      const name = item.roleName ?? item.key.split("/")[0];
      if (!byRole.has(name)) byRole.set(name, []);
      byRole.get(name)!.push(item);
    }
    return [
      { name: null as string | null, items: global },
      ...Array.from(byRole.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, list]) => ({ name, items: list })),
    ].filter((g) => g.items.length > 0);
  }, [items]);

  const toggle = (key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const userId = getClientRuntimeContext().userId;
      await fetch(`/api/settings/roles/${encodeURIComponent(roleId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          ...(kind === "skill"
            ? { skillIds: Array.from(checked) }
            : { mcpRefs: Array.from(checked) }),
        }),
      });
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {kind === "skill" ? t("pickerTitleSkill") : t("pickerTitleMcp")}
          </DialogTitle>
          <DialogDescription>{t("pickerDesc")}</DialogDescription>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <p className="text-muted-foreground flex items-center justify-center gap-1.5 py-8 text-xs">
              <Loader2Icon className="size-3.5 animate-spin" />
              {tc("loading")}
            </p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-xs">
              {t("pickerEmpty")}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.name ?? "__global__"} className="mb-3 last:mb-0">
                <p className="text-muted-foreground mb-1 flex items-center gap-1.5 px-1 text-[11px] font-medium">
                  {group.name === null ? (
                    <>
                      <GlobeIcon className="size-3" />
                      {t("sourceGlobal")}
                    </>
                  ) : (
                    group.name
                  )}
                </p>
                <div className="grid gap-0.5">
                  {group.items.map((item) => {
                    const active = checked.has(item.key);
                    return (
                      <label
                        key={item.key}
                        className={cn(
                          "flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
                          active ? "bg-primary/5" : "hover:bg-muted/60",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => toggle(item.key)}
                          className="mt-0.5 size-3.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">
                            {item.title}
                            {item.version && (
                              <span className="text-muted-foreground bg-muted ml-1.5 rounded px-1 py-0.5 font-mono text-[10px]">
                                v{item.version}
                              </span>
                            )}
                          </span>
                          {item.description && (
                            <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                              {item.description}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={() => void handleSave()}
            disabled={saving || loading}
            className="gap-1.5"
          >
            {saving && <Loader2Icon className="size-3.5 animate-spin" />}
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
