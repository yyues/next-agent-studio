import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { encrypt, maskApiKey } from "@/lib/crypto";
import type { ProviderSettingDoc } from "@/types/db";

// 获取当前用户的 provider 配置（apiKey 不返回明文，只返回掩码 + 是否已设置）
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const db = await getDb();
  const doc = await db
    .collection<ProviderSettingDoc>("provider_settings")
    .findOne({ userId: user._id });
  if (!doc) {
    return NextResponse.json({ settings: null });
  }
  return NextResponse.json({
    settings: {
      baseUrl: doc.baseUrl,
      model: doc.model,
      apiKeyHint: doc.apiKeyHint,
      hasApiKey: true,
    },
  });
}

// 保存/更新配置（apiKey 加密入库）
export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  let body: { baseUrl?: string; model?: string; apiKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const baseUrl = body.baseUrl?.trim();
  const model = body.model?.trim();
  const apiKey = body.apiKey?.trim();

  if (!baseUrl || !model) {
    return NextResponse.json({ error: "API 路径和模型 ID 不能为空" }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json({ error: "API Key 不能为空" }, { status: 400 });
  }

  const db = await getDb();
  const now = new Date();
  const apiKeyEnc = encrypt(apiKey);
  const apiKeyHint = maskApiKey(apiKey);

  await db.collection<ProviderSettingDoc>("provider_settings").updateOne(
    { userId: user._id },
    {
      $set: { baseUrl, model, apiKeyEnc, apiKeyHint, updatedAt: now },
      $setOnInsert: { userId: user._id, createdAt: now },
    },
    { upsert: true },
  );

  return NextResponse.json({
    settings: { baseUrl, model, apiKeyHint, hasApiKey: true },
  });
}

// 删除配置
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const db = await getDb();
  await db.collection<ProviderSettingDoc>("provider_settings").deleteOne({ userId: user._id });
  return NextResponse.json({ ok: true });
}
