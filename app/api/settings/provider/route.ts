import { NextResponse } from "next/server";
import {
  getProviderSettings,
  normalizeUserId,
  upsertProviderSettings,
} from "@/lib/server-settings";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = normalizeUserId(
      searchParams.get("userId") ?? req.headers.get("x-user-id"),
    );

    const result = await getProviderSettings(userId);

    return NextResponse.json({
      userId,
      source: result.source,
      providerName: result.config.providerName,
      baseUrl: result.config.baseUrl,
      model: result.config.model,
      embeddingModel: result.config.embeddingModel,
      embeddingBaseUrl: result.config.embeddingBaseUrl,
      temperature: result.config.temperature,
      maskedApiKey: result.maskedApiKey,
      maskedEmbeddingApiKey: result.maskedEmbeddingApiKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read provider settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const payload = (await req.json()) as {
      userId?: string;
      providerName?: string;
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      embeddingModel?: string;
      embeddingBaseUrl?: string;
      embeddingApiKey?: string;
      temperature?: number;
    };

    const userId = normalizeUserId(payload.userId ?? req.headers.get("x-user-id"));

    const result = await upsertProviderSettings(userId, {
      providerName: payload.providerName,
      baseUrl: payload.baseUrl,
      apiKey: payload.apiKey,
      model: payload.model,
      embeddingModel: payload.embeddingModel,
      embeddingBaseUrl: payload.embeddingBaseUrl,
      embeddingApiKey: payload.embeddingApiKey,
      temperature: payload.temperature,
    });

    return NextResponse.json({
      userId,
      source: result.source,
      providerName: result.config.providerName,
      baseUrl: result.config.baseUrl,
      model: result.config.model,
      embeddingModel: result.config.embeddingModel,
      embeddingBaseUrl: result.config.embeddingBaseUrl,
      temperature: result.config.temperature,
      maskedApiKey: result.maskedApiKey,
      maskedEmbeddingApiKey: result.maskedEmbeddingApiKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update provider settings.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
