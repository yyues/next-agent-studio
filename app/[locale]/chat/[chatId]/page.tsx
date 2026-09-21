import { setRequestLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { ChatClient } from "../chat-client";
import { AUTH_COOKIE, verifyAuthToken } from "@/lib/auth";
import { connectToMongo } from "@/lib/mongodb";
import { ConversationModel } from "@/lib/models/conversation";

/** 服务端解析登录用户 id(与 lib/auth-request 同一 cookie 约定);失败视为未知 */
async function getSessionUserId(): Promise<string | undefined> {
  try {
    const store = await cookies();
    const raw = store.get(AUTH_COOKIE)?.value;
    if (!raw) return undefined;
    return (await verifyAuthToken(decodeURIComponent(raw))) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * URL 会话是否已落库:决定刷新时"占位→领养"启动窗口的占位 UI——
 * 已有会话显示骨架屏(等新会话欢迎页一闪而过的错位感),新对话直接显示欢迎页。
 * 客户端在会话列表返回前无法区分二者,只能由服务端告知。
 */
async function hasConversationHistory(
  userId: string | undefined,
  chatId: string,
): Promise<boolean> {
  if (!userId) return false;
  try {
    await connectToMongo();
    return !!(await ConversationModel.exists({
      userId,
      conversationId: chatId,
    }));
  } catch {
    return false; // DB 异常时回退原行为(显示欢迎页)
  }
}

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

  const userId = await getSessionUserId();
  const expectHistory = await hasConversationHistory(userId, chatId);

  return (
    <ChatClient
      chatId={chatId}
      initialRoleId={roleId}
      appTitle={appTitle}
      expectHistory={expectHistory}
    />
  );
}
