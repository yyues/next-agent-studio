import { NextResponse } from "next/server";
import {
  getRoleSettings,
  normalizeUserId,
  setCurrentRole,
} from "@/lib/server-settings";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = normalizeUserId(
      searchParams.get("userId") ?? req.headers.get("x-user-id"),
    );

    const settings = await getRoleSettings(userId);

    return NextResponse.json({
      userId,
      currentRoleId: settings.currentRoleId,
      roles: settings.roles,
      availableSkillIds: settings.availableSkillIds,
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

    const userId = normalizeUserId(payload.userId ?? req.headers.get("x-user-id"));
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

    if (!payload.roleId?.trim()) {
      return NextResponse.json({ error: "roleId is required." }, { status: 400 });
    }
    if (!payload.displayName?.trim()) {
      return NextResponse.json({ error: "displayName is required." }, { status: 400 });
    }
    if (!payload.systemPrompt?.trim()) {
      return NextResponse.json({ error: "systemPrompt is required." }, { status: 400 });
    }

    const userId = normalizeUserId(payload.userId ?? req.headers.get("x-user-id"));
    const { createRole } = await import("@/lib/server-settings");
    const role = await createRole(userId, {
      roleId: payload.roleId.trim(),
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
