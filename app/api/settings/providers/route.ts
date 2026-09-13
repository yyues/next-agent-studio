/**
 * GET  /api/settings/providers?userId= — 供应商列表(apiKey 掩码)
 * POST /api/settings/providers — 新建/更新供应商
 */
import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import {
  listProviderEntries,
  upsertProviderEntry,
} from "@/lib/server-settings";

async function getUserId(req: Request, body?: { userId?: string }) {
  const url = new URL(req.url);
  return getAuthUserId(
    req,
    url.searchParams.get("userId") ??
      req.headers.get("x-user-id") ??
      body?.userId,
  );
}

export async function GET(req: Request) {
  try {
    const userId = await getUserId(req);
    const providers = await listProviderEntries(userId);
    return NextResponse.json({ providers });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list providers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      userId?: string;
      providerId?: string;
      name: string;
      providerName?: string;
      baseUrl: string;
      apiKey?: string;
      model: string;
      temperature?: number;
    };
    const userId = await getUserId(req, body);
    const entry = await upsertProviderEntry(userId, {
      providerId: body.providerId,
      name: body.name,
      providerName: body.providerName,
      baseUrl: body.baseUrl,
      apiKey: body.apiKey,
      model: body.model,
      temperature: body.temperature,
    });
    return NextResponse.json({
      provider: {
        providerId: entry!.providerId,
        name: entry!.name,
        active: entry!.active,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save provider.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
