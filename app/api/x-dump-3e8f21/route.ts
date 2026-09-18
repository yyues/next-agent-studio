import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToMongo } from "@/lib/mongodb";

export async function GET() {
  await connectToMongo();
  const rows = await mongoose.connection.db
    .collection("mcpservers")
    .find({})
    .toArray();
  return NextResponse.json({
    count: rows.length,
    rows: rows.map((r) => ({
      userId: r.userId,
      roleId: r.roleId,
      serverId: r.serverId,
      name: r.name,
      type: r.type,
      url: r.url,
      urlType: typeof r.url,
      command: r.command,
      enabled: r.enabled,
      scope: r.scope,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      keys: Object.keys(r),
    })),
  });
}
