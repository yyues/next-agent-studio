import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const role = user.role ?? "user";
  return NextResponse.json({
    user: { id: user._id, email: user.email, name: user.name, role },
  });
}
