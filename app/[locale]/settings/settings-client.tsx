"use client";

import { useState, type FC } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { ArrowLeftIcon, BotIcon, CpuIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProvidersPanel } from "@/components/settings/providers-panel";
import { RolesPanel } from "@/components/settings/roles-panel";

type SettingsTab = "providers" | "roles";

/**
 * 统一设置页壳:毛玻璃顶栏(返回对话 + 品牌) → 页头 → 分段式标签页。
 * 标签状态同步到 URL ?tab=(可深链/刷新保持),切换时面板 remount 触发入场动画。
 * 供应商与角色两个模块共用此壳,内容面板各自管理数据与弹窗。
 */
export const SettingsClient: FC<{ appTitle: string }> = ({ appTitle }) => {
  const t = useTranslations("settings");
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialTab =
    searchParams.get("tab") === "roles" ? "roles" : "providers";
  const [tab, setTab] = useState<SettingsTab>(initialTab);

  const switchTab = (next: SettingsTab) => {
    if (next === tab) return;
    setTab(next);
    // replace 不产生历史记录,保持返回键行为可预测
    router.replace(`/settings?tab=${next}`, { scroll: false });
  };

  return (
    <div className="from-primary/5 via-background to-background min-h-dvh bg-gradient-to-b">
      {/* 顶栏 */}
      <header className="bg-background/70 border-border/50 sticky top-0 z-20 border-b backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-2xl items-center gap-2 px-4">
          <button
            type="button"
            onClick={() => router.push("/chat")}
            className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm transition-colors"
          >
            <ArrowLeftIcon className="size-4" />
            <span className="hidden sm:inline">{t("backToChat")}</span>
          </button>
          <div className="flex-1" />
          <span className="text-muted-foreground text-xs font-medium">
            {appTitle}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-16">
        {/* 页头 */}
        <div className="mt-10">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("pageTitle")}
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            {t("pageDesc")}
          </p>
        </div>

        {/* 分段式标签页:滑动指示器 + 深链同步 */}
        <div
          role="tablist"
          aria-label={t("pageTitle")}
          className="bg-muted relative mb-8 mt-6 flex h-11 rounded-full p-1"
        >
          <span
            aria-hidden
            className="bg-background shadow-sm absolute inset-y-1 start-1 w-[calc(50%-0.25rem)] rounded-full transition-transform duration-200 ease-out motion-reduce:transition-none"
            style={{
              transform: tab === "roles" ? "translateX(100%)" : undefined,
            }}
          />
          {(
            [
              { id: "providers", icon: CpuIcon, label: t("tabProviders") },
              { id: "roles", icon: BotIcon, label: t("tabRoles") },
            ] as const
          ).map(({ id, icon: Icon, label }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(id)}
                className={cn(
                  "relative z-10 flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-primary/50 focus-visible:ring-2",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            );
          })}
        </div>

        {/* 面板:key 变化 remount → 入场动画 */}
        <div key={tab} className="aui-anim-item">
          {tab === "roles" ? <RolesPanel /> : <ProvidersPanel />}
        </div>
      </main>
    </div>
  );
};
