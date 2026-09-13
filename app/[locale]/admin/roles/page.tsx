import { redirect } from "next/navigation";

/**
 * 旧 /{locale}/admin/roles → 统一设置页(角色标签)。
 * 角色管理已并入 /settings,此路由仅做兼容跳转。
 */
export default async function OldRolesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/settings?tab=roles`);
}
