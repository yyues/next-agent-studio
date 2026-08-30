/**
 * Provider 配置本地加密存储
 *
 * 未登录时：加密后存 localStorage
 * 登录时：通过 API 同步到 MongoDB
 *
 * 加密使用 Web Crypto API (AES-GCM)，
 * 密钥从浏览器指纹派生，无需用户管理密钥。
 */

export type ProviderConfig = {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
};

const STORAGE_KEY = "jx-ai-provider-config";

// 从浏览器环境派生一个稳定的加密密钥
async function deriveKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  // 使用 navigator.userAgent + 固定盐值作为密钥材料
  const material = encoder.encode(
    (typeof navigator !== "undefined" ? navigator.userAgent : "server") +
      "::jx-ai-provider-salt",
  );
  const hash = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

// 加密字符串 → base64
async function encryptText(plain: string): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plain);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );
  // 将 iv + cipher 合并后 base64 编码
  const combined = new Uint8Array(iv.length + new Uint8Array(cipher).length);
  combined.set(iv);
  combined.set(new Uint8Array(cipher), iv.length);
  return btoa(String.fromCharCode(...combined));
}

// base64 → 解密字符串
async function decryptText(encoded: string): Promise<string> {
  const key = await deriveKey();
  const data = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = data.slice(0, 12);
  const cipher = data.slice(12);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipher,
  );
  return new TextDecoder().decode(plain);
}

/**
 * 保存 provider 配置到本地（加密）
 */
export async function saveProviderLocal(config: ProviderConfig): Promise<void> {
  const encrypted = await encryptText(JSON.stringify(config));
  localStorage.setItem(STORAGE_KEY, encrypted);
}

/**
 * 从本地读取 provider 配置（解密）
 */
export async function loadProviderLocal(): Promise<ProviderConfig | null> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const decrypted = await decryptText(raw);
    return JSON.parse(decrypted) as ProviderConfig;
  } catch {
    // 解密失败则清除损坏数据
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

/**
 * 清除本地 provider 配置
 */
export function clearProviderLocal(): void {
  localStorage.removeItem(STORAGE_KEY);
}
