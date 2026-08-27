import { getCurrentUser } from "@/lib/auth";
import { getDefaultProviderConfig } from "@/lib/agent";
import { ChatApp } from "@/components/chat/ChatApp";
import { redirect } from "next/navigation";

export default async function ChatPage() {
  const user = await getCurrentUser();
  const allowGuest = process.env.ALLOW_GUEST_CHAT === "true";

  // 未登录且未开启游客模式 → 跳转登录
  if (!user && !allowGuest) {
    redirect("/login");
  }

  // 前端需要知道是否开启了游客模式、是否有默认 provider、默认模型
  const defaultConfig = getDefaultProviderConfig();
  const initialConfig = {
    allowGuestChat: allowGuest,
    hasDefaultProvider: defaultConfig !== null,
    defaultModel: defaultConfig?.modelId ?? null,
    defaultBaseUrl: defaultConfig?.baseUrl ?? null,
  };

  return (
    <ChatApp
      user={user ? { id: user._id, email: user.email, name: user.name } : null}
      initialConfig={initialConfig}
    />
  );
}
