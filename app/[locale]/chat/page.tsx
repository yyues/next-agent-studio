import { redirect } from "next/navigation";

/**
 * /{locale}/chat → /{locale}/chat/<chatId>
 *
 * 直接访问 /chat（无 chatId）时生成会话 id 并 redirect 到动态路由，
 * 保证 URL 始终为 /chat/<chatId> 形态。保留 query（如 ?roleId=pm）。
 */
export default async function ChatIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(sp ?? {})) {
    if (typeof v === "string") query.set(k, v);
  }
  const qs = query.toString();
  redirect(`/${locale}/chat/${crypto.randomUUID()}${qs ? `?${qs}` : ""}`);
}
