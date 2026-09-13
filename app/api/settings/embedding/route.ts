/**
 * GET /api/settings/embedding?userId= — 内置 Embedding 配置(model 固定只读)
 * PUT /api/settings/embedding — 更新可选的 baseUrl/apiKey 覆盖
 */
import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import {
  getEmbeddingSettings,
  upsertEmbeddingSettings,
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
    const uid = await getUserId(req);
    const settings = await getEmbeddingSettings(uid);
    return NextResponse.json(settings);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load embedding settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as {
      userId?: string;
      embeddingBaseUrl?: string;
      embeddingApiKey?: string;
    };
    const uid = await getUserId(req, body);
    const result = await upsertEmbeddingSettings(uid, body);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save embedding settings.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
