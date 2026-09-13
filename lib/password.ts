/**
 * 密码哈希(scrypt)。仅限 Node 运行时的 API 路由使用,
 * 不可被 middleware(Edge)引用,故独立于 lib/auth.ts。
 */
import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (
    (await scryptAsync(password, salt, 64)) as Buffer
  ).toString("hex");
  return { salt, passwordHash: hash };
}

export async function verifyPassword(password: string, salt: string, passwordHash: string) {
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(passwordHash, "hex");
  return (
    hash.length === expected.length && timingSafeEqual(hash, expected)
  );
}
