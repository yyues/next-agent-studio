import { NextResponse } from "next/server";
import {
  testProviderSettings,
  getProviderSettings,
} from "@/lib/server-settings";
import { getAuthUserId } from "@/lib/auth-request";

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as {
      userId?: string;
      providerName?: string;
      baseUrl?: string;
      apiKey?: string;
      model?: string;
    };

    const userId = await getAuthUserId(req, payload.userId ?? req.headers.get("x-user-id"));
    const current = await getProviderSettings(userId);

    await testProviderSettings({
      providerName: payload.providerName ?? current.config.providerName,
      baseUrl: payload.baseUrl ?? current.config.baseUrl,
      apiKey: payload.apiKey ?? current.config.apiKey,
      model: payload.model ?? current.config.model,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider test failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
