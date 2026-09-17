import { redirect } from "next/navigation";

/**
 * 旧 /{locale}/settings/roles/[roleId] → 设置页角色工作区(选中该角色)。
 * 角色详情已并入 /settings 的双栏工作区,此路由仅做兼容跳转。
 */
export default async function OldRoleDetailPage({
  params,
}: {
  params: Promise<{ locale: string; roleId: string }>;
}) {
  const { locale, roleId } = await params;
  redirect(
    `/${locale}/settings?tab=roles&role=${encodeURIComponent(roleId)}`,
  );
}
