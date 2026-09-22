import { setRequestLocale } from "next-intl/server";
import { ChatClient } from "../chat-client";

/**
 * /{locale}/chat/<chatId>?roleId=<roleId>
 *
 * 动态路由：chatId 作为会话唯一标识（Assistant 的 remount key）。
 * roleId 为可选 query，用于角色级会话；缺省回退到运行时上下文/服务端默认角色。
 */
export default async function ChatConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; chatId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, chatId } = await params;
  setRequestLocale(locale);

  const sp = await searchParams;
  const roleId = typeof sp?.roleId === "string" ? sp.roleId : undefined;

  // 网页标题同源(APP_TITLE env),服务端读取传给客户端侧边栏展示
  const appTitle = process.env.APP_TITLE?.trim() || "Agent Studio";

  return (
    <ChatClient
      chatId={chatId}
      initialRoleId={roleId}
      appTitle={appTitle}
    />
  );
}
