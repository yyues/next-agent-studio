import { NextResponse } from "next/server";
import { getDefaultProviderConfig } from "@/lib/agent";

export const dynamic = "force-dynamic";

// 公开配置接口：供前端判断游客模式、是否有默认 provider、默认模型
export async function GET() {
  const defaultConfig = getDefaultProviderConfig();
  return NextResponse.json({
    allowGuestChat: process.env.ALLOW_GUEST_CHAT === "true",
    hasDefaultProvider: defaultConfig !== null,
    defaultModel: defaultConfig?.modelId ?? null,
    defaultBaseUrl: defaultConfig?.baseUrl ?? null,
  });
}
