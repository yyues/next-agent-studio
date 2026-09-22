import { NextResponse } from "next/server";

const unavailable = () =>
  NextResponse.json(
    { error: "Message feedback persistence is disabled." },
    { status: 410 },
  );

export const POST = unavailable;
export const DELETE = unavailable;
