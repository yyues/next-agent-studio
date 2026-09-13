/**
 * GET /api/settings/providers/[providerId]/export?userId= — 生成 cc-switch 导出
 * 返回:深度链接(ccswitch:// 一键导入) + Claude settings.json 片段 + 备份 JSON
 * 含明文 apiKey,仅本人(userId 隔离)可取。
 */
import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getProviderEntryRaw } from "@/lib/server-settings";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ providerId: string }> },
) {
  try {
    const { providerId } = await params;
    const url = new URL(req.url);
    const userId = await getAuthUserId(req, url.searchParams.get("userId"));

    const entry = await getProviderEntryRaw(userId, providerId);
    if (!entry) {
      return NextResponse.json({ error: "Provider not found." }, { status: 404 });
    }

    // cc-switch 深度链接协议:ccswitch://v1/import?resource=provider&app=claude&...
    const deepLink =
      `ccswitch://v1/import?resource=provider&app=claude` +
      `&name=${encodeURIComponent(entry.name)}` +
      `&endpoint=${encodeURIComponent(entry.baseUrl)}` +
      `&apiKey=${encodeURIComponent(entry.apiKey)}`;

    // Claude settings.json 片段(cc-switch 手动添加 / 直接粘贴)
    const claudeSettings = {
      env: {
        ANTHROPIC_BASE_URL: entry.baseUrl,
        ANTHROPIC_AUTH_TOKEN: entry.apiKey,
      },
    };

    const backup = {
      name: entry.name,
      providerName: entry.providerName,
      baseUrl: entry.baseUrl,
      apiKey: entry.apiKey,
      model: entry.model,
      temperature: entry.temperature,
    };

    return NextResponse.json({ deepLink, claudeSettings, backup });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to export provider.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
