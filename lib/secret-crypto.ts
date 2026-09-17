/**
 * 数据库敏感字段加密(AES-256-GCM,仅 Node 运行时的 API 路由使用)。
 *
 * 覆盖 ProviderEntry/ProviderConfig 的 apiKey、McpServer.headers 的值。
 * 密文带 "enc:v1:" 前缀;不带前缀的旧明文读取时原样返回(懒迁移,
 * 下次写入即被加密)。用户密码本就是 scrypt 单向哈希,无需加密。
 *
 * 密钥来源(优先级):ENCRYPTION_KEY → AUTH_SECRET → 登录凭据派生。
 * 生产环境务必显式配置 ENCRYPTION_KEY;更换密钥后旧密文将无法解密。
 */
import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { getAuthCredentials } from "@/lib/auth";

const PREFIX = "enc:v1:";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const explicit = process.env.ENCRYPTION_KEY?.trim();
  if (explicit) {
    cachedKey = createHash("sha256").update(explicit).digest();
    return cachedKey;
  }
  const authSecret = process.env.AUTH_SECRET?.trim();
  if (authSecret) {
    cachedKey = createHash("sha256")
      .update(`db-secret:${authSecret}`)
      .digest();
    return cachedKey;
  }
  console.warn(
    "[secret-crypto] ENCRYPTION_KEY 未配置,回退用登录凭据派生密钥;生产环境请显式设置 ENCRYPTION_KEY",
  );
  const { username, password } = getAuthCredentials();
  cachedKey = createHash("sha256").update(`${username}:${password}`).digest();
  return cachedKey;
}

/** 加密;空串与已加密值原样返回(幂等,便于 upsert 沿用旧值) */
export function encryptSecret(plain: string): string {
  if (!plain || plain.startsWith(PREFIX)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    [iv, tag, ct].map((b) => b.toString("base64url")).join(".")
  );
}

/** 解密;非密文(旧明文)原样返回;解密失败抛错(通常是密钥被更换) */
export function decryptSecret(stored: string): string {
  if (!stored?.startsWith(PREFIX)) return stored;
  const parts = stored.slice(PREFIX.length).split(".");
  if (parts.length !== 3) throw new Error("Corrupted encrypted secret.");
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getKey(),
      Buffer.from(parts[0], "base64url"),
    );
    decipher.setAuthTag(Buffer.from(parts[1], "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[2], "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(
      "Failed to decrypt secret — ENCRYPTION_KEY may have changed.",
    );
  }
}

/** 加密 map 的每个值(键保留明文,如 Authorization) */
export function encryptSecretMap(
  map: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(map).map(([k, v]) => [k, encryptSecret(v)]),
  );
}

/** 解密 map 的每个值;非密文值原样返回 */
export function decryptSecretMap(
  map: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(map).map(([k, v]) => [k, decryptSecret(v)]),
  );
}
