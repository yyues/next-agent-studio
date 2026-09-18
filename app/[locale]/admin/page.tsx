import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AUTH_COOKIE, verifyAuthToken } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin";
import { AdminClient } from "@/components/admin/admin-client";

/**
 * /admin — 全局资源库维护页(仅管理员)。
 * 服务端守卫:未登录跳登录,非管理员回对话页(API 层另有独立守卫)。
 */
export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const store = await cookies();
  const token = store.get(AUTH_COOKIE)?.value;
  const user = await verifyAuthToken(token).catch(() => null);
  if (!user) {
    redirect(`/${locale}/login?from=/${locale}/admin`);
  }
  if (!(await isAdminUser(user))) {
    redirect(`/${locale}/chat`);
  }

  return (
    <Suspense>
      <AdminClient />
    </Suspense>
  );
}
