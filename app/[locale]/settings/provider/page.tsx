import { redirect } from "next/navigation";

/**
 * 旧 /{locale}/settings/provider → 统一设置页(供应商标签)。
 * 供应商配置已并入 /settings,此路由仅做兼容跳转。
 */
export default async function OldProviderSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/settings?tab=providers`);
}
