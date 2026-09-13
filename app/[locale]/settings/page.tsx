import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { SettingsClient } from "./settings-client";

/**
 * /{locale}/settings — 统一设置页(模型供应商 + 角色管理)。
 * 单栏工作台布局:顶栏 + 居中内容(max-w-2xl) + 分段式标签页。
 */
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="bg-background text-foreground min-h-dvh">
      <Suspense>
        <SettingsClient appTitle={process.env.APP_TITLE || "Agent Studio"} />
      </Suspense>
    </div>
  );
}
