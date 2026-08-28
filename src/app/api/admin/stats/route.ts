import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import type { UserDoc, ConversationDoc, CustomerDoc, MessageDoc } from "@/types/db";

/**
 * GET /api/admin/stats
 * Dashboard 看板统计数据
 */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const db = await getDb();
  const [
    totalUsers,
    totalAdmins,
    totalConversations,
    totalCustomers,
    activeCustomers,
    trialCustomers,
    totalMessages,
    todayUsers,
    todayConversations,
    todayMessages,
  ] = await Promise.all([
    db.collection<UserDoc>("users").countDocuments(),
    db.collection<UserDoc>("users").countDocuments({ role: "admin" }),
    db.collection<ConversationDoc>("conversations").countDocuments(),
    db.collection<CustomerDoc>("customers").countDocuments(),
    db
      .collection<CustomerDoc>("customers")
      .countDocuments({ status: { $in: ["active", "trial"] } }),
    db.collection<CustomerDoc>("customers").countDocuments({ status: "trial" }),
    db.collection<MessageDoc>("messages").countDocuments(),
    // 今天新增的用户/会话/消息
    (() => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return db.collection<UserDoc>("users").countDocuments({ createdAt: { $gte: start } });
    })(),
    (() => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return db
        .collection<ConversationDoc>("conversations")
        .countDocuments({ createdAt: { $gte: start } });
    })(),
    (() => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return db.collection<MessageDoc>("messages").countDocuments({ createdAt: { $gte: start } });
    })(),
  ]);

  // 近 7 天趋势（按日）
  const days = 7;
  const trendStart = new Date();
  trendStart.setHours(0, 0, 0, 0);
  trendStart.setDate(trendStart.getDate() - (days - 1));

  const [userTrend, conversationTrend, messageTrend] = await Promise.all([
    dailyGroup("users", "createdAt", trendStart),
    dailyGroup("conversations", "createdAt", trendStart),
    dailyGroup("messages", "createdAt", trendStart),
  ]);

  return NextResponse.json({
    overview: {
      totalUsers,
      totalAdmins,
      totalConversations,
      totalMessages,
      totalCustomers,
      activeCustomers,
      trialCustomers,
    },
    today: {
      users: todayUsers,
      conversations: todayConversations,
      messages: todayMessages,
    },
    trend: {
      days: Array.from({ length: days }, (_, i) => {
        const d = new Date(trendStart);
        d.setDate(d.getDate() + i);
        return `${d.getMonth() + 1}-${d.getDate()}`;
      }),
      users: userTrend,
      conversations: conversationTrend,
      messages: messageTrend,
    },
  });
}

async function dailyGroup(collection: string, field: string, startFrom: Date): Promise<number[]> {
  const db = await getDb();
  const dayMs = 24 * 60 * 60 * 1000;
  const result = new Map<number, number>();
  const days = 7;
  for (let i = 0; i < days; i++) {
    const start = new Date(startFrom.getTime() + i * dayMs);
    const end = new Date(start.getTime() + dayMs);
    const count = await db.collection(collection).countDocuments({
      [field]: { $gte: start, $lt: end },
    });
    result.set(start.getTime(), count);
  }
  const arr: number[] = [];
  for (let i = 0; i < days; i++) {
    const start = new Date(startFrom.getTime() + i * dayMs);
    arr.push(result.get(start.getTime()) ?? 0);
  }
  return arr;
}
