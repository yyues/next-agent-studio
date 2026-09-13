import { redirect } from "next/navigation";

/**
 * 旧 /{locale}/admin/roles/[roleId] → /settings/roles/[roleId]。
 * 角色详情已迁入 /settings,此路由仅做兼容跳转。
 */
export default async function OldRoleDetailPage({
  params,
}: {
  params: Promise<{ locale: string; roleId: string }>;
}) {
  const { locale, roleId } = await params;
  redirect(`/${locale}/settings/roles/${encodeURIComponent(roleId)}`);
}
