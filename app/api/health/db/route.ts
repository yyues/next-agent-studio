import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToMongo, getMongoConnectionInfo } from "@/lib/mongodb";

export async function GET() {
  const connection = getMongoConnectionInfo();

  try {
    await connectToMongo();

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("MongoDB connection was created without an active db handle.");
    }

    await db.command({ ping: 1 });

    return NextResponse.json({
      ok: true,
      connection,
      message: "MongoDB ping succeeded.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        ok: false,
        connection,
        error: message,
      },
      { status: 503 },
    );
  }
}
