import { NextResponse } from "next/server";
import {
  getRoleSettings,
  setCurrentRole,
} from "@/lib/server-settings";
import { getAuthUserId } from "@/lib/auth-request";

function fallbackUserId(req: Request) {
  const { searchParams } = new URL(req.url);
  return searchParams.get("userId") ?? req.headers.get("x-user-id") ?? undefined;
}

export async function GET(req: Request) {
  try {
    const userId = await getAuthUserId(req, fallbackUserId(req));
    const settings = await getRoleSettings(userId);

    return NextResponse.json({
      userId,
      currentRoleId: settings.currentRoleId,
      // systemPrompt 全文只有详情端点需要;列表消费方只用摘要字段,
      // 不传输可显著减小 payload(角色多时尤其明显)
      roles: settings.roles.map(({ systemPrompt: _systemPrompt, ...rest }) => rest),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read role settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const payload = (await req.json()) as {
      userId?: string;
      roleId?: string;
    };

    if (!payload.roleId?.trim()) {
      return NextResponse.json({ error: "roleId is required." }, { status: 400 });
    }

    const userId = await getAuthUserId(req, payload.userId ?? req.headers.get("x-user-id"));
    const result = await setCurrentRole(userId, payload.roleId.trim());

    return NextResponse.json({
      userId,
      currentRoleId: result.currentRoleId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to switch role.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as {
      userId?: string;
      roleId?: string;
      displayName?: string;
      systemPrompt?: string;
      enabled?: boolean;
      priority?: number;
    };

    if (!payload.displayName?.trim()) {
      return NextResponse.json({ error: "displayName is required." }, { status: 400 });
    }
    if (!payload.systemPrompt?.trim()) {
      return NextResponse.json({ error: "systemPrompt is required." }, { status: 400 });
    }

    const userId = await getAuthUserId(req, payload.userId ?? req.headers.get("x-user-id"));
    const { createRole } = await import("@/lib/server-settings");
    const role = await createRole(userId, {
      // roleId 可省略,由数据库计数器自增生成
      roleId: payload.roleId?.trim() || undefined,
      displayName: payload.displayName.trim(),
      systemPrompt: payload.systemPrompt.trim(),
      enabled: payload.enabled,
      priority: payload.priority,
    });

    return NextResponse.json({ role });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create role.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
