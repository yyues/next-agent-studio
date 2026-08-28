import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@/types/db";

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-insecure-secret-change-me");

const expiresIn = process.env.JWT_EXPIRES_IN ?? "7d";

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role?: UserRole;
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub || typeof payload.email !== "string") return null;
    const role = typeof payload.role === "string" ? (payload.role as UserRole) : undefined;
    return { sub: payload.sub, email: payload.email, role };
  } catch {
    return null;
  }
}
