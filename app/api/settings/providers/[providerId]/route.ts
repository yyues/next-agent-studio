/**
 * PUT    /api/settings/providers/[providerId] — 更新(body 同 POST)
 * PATCH  /api/settings/providers/[providerId] — 设为激活
 * DELETE /api/settings/providers/[providerId] — 删除
 */
import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { upsertProviderEntry,
  deleteProviderEntry,
  setActiveProviderEntry,
} from "@/lib/server-settings";

type Params = { params: Promise<{ providerId: string }> };

async function getUserId(req: Request, body?: { userId?: string }) {
  const url = new URL(req.url);
  return getAuthUserId(
    req,
    url.searchParams.get("userId") ??
      req.headers.get("x-user-id") ??
      body?.userId,
  );
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const { providerId } = await params;
    const body = (await req.json()) as {
      userId?: string;
      name: string;
      providerName?: string;
      baseUrl: string;
      apiKey?: string;
      model: string;
      temperature?: number;
    };
    const userId = await getUserId(req, body);
    await upsertProviderEntry(userId, { ...body, providerId });
    return NextResponse.json({ saved: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update provider.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { providerId } = await params;
    let body: { userId?: string } = {};
    try {
      body = (await req.json()) as { userId?: string };
    } catch {
      // PATCH 可无 body
    }
    const userId = await getUserId(req, body);
    const result = await setActiveProviderEntry(userId, providerId);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to activate provider.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const { providerId } = await params;
    const url = new URL(req.url);
    const userId = await getAuthUserId(req, url.searchParams.get("userId"));
    await deleteProviderEntry(userId, providerId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete provider.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
