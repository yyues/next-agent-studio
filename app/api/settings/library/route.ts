/**
 * GET /api/settings/library — "从库中选择"的可选池
 * (全局库 + 自己的其他角色;?excludeRoleId= 排除当前编辑的角色)
 */
import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { listSelectableLibrary } from "@/lib/resource-library";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = await getAuthUserId(
      req,
      url.searchParams.get("userId") ?? req.headers.get("x-user-id"),
    );
    const excludeRoleId = url.searchParams.get("excludeRoleId") ?? undefined;
    return NextResponse.json(
      await listSelectableLibrary(userId, excludeRoleId),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load library.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
