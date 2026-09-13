/**
 * POST /api/settings/providers/[providerId]/test — 连通性测试
 * body 可传字段覆盖已存配置(编辑未保存时测试);userId 可 query 或 body
 */
import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import {
  getProviderEntryRaw,
  testProviderSettings,
} from "@/lib/server-settings";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ providerId: string }> },
) {
  try {
    const { providerId } = await params;
    const url = new URL(req.url);
    const body = (await req.json().catch(() => ({}))) as {
      userId?: string;
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      providerName?: string;
    };
    const userId = await getAuthUserId(
      req,
      url.searchParams.get("userId") ?? req.headers.get("x-user-id") ?? body.userId,
    );

    const stored = await getProviderEntryRaw(userId, providerId);
    const baseUrl = body.baseUrl?.trim() || stored?.baseUrl;
    const model = body.model?.trim() || stored?.model;
    const apiKey = body.apiKey?.trim() || stored?.apiKey;
    if (!baseUrl || !model || !apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing baseUrl/model/apiKey." },
        { status: 400 },
      );
    }

    await testProviderSettings({
      providerName: body.providerName?.trim() || stored?.providerName || "openai-compatible",
      baseUrl,
      apiKey,
      model,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Connection failed.",
      },
      { status: 400 },
    );
  }
}
