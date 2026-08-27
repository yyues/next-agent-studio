import { createCipheriv, createDecipheriv, scryptSync, randomBytes } from "crypto";

// 从 ENCRYPTION_KEY（任意 passphrase）派生 32 字节密钥
// 若未配置则 fallback 到 JWT_SECRET，保证开箱可用（生产环境务必设置独立 ENCRYPTION_KEY）
const SALT = "agent-demo-provider-encryption-salt-v1";
function getKey(): Buffer {
  const passphrase =
    process.env.ENCRYPTION_KEY?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    "dev-insecure-encryption-key";
  return scryptSync(passphrase, SALT, 32);
}

// 密文格式：base64(iv[12] || authTag[16] || ciphertext)
export function encrypt(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(payload: string): string {
  const key = getKey();
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

// 掩码显示 apiKey，只保留前后 4 位
export function maskApiKey(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}
