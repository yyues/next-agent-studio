/**
 * 轻量认证: HMAC 签名 cookie。
 * 凭据来自环境变量(AUTH_USERNAME/AUTH_PASSWORD),签名密钥 AUTH_SECRET(缺省由凭据派生)。
 * 使用 Web Crypto,Edge(middleware)与 Node(route)均可运行。
 */

export const AUTH_COOKIE = "agent_studio_auth";
export const AUTH_MAX_AGE = 60 * 60 * 24 * 7; // 7 天

export function getAuthCredentials() {
  return {
    username: process.env.AUTH_USERNAME?.trim() || "admin",
    password: process.env.AUTH_PASSWORD?.trim() || "admin123",
  };
}

async function getSecret() {
  const { username, password } = getAuthCredentials();
  const secret = process.env.AUTH_SECRET?.trim() || `${username}:${password}`;
  return new TextEncoder().encode(secret);
}

function toHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 生成 token:b64url(username).exp.sig(全 cookie 安全字符,避免任何编码篡改) */
export async function signAuthToken(username: string) {
  const exp = Date.now() + AUTH_MAX_AGE * 1000;
  const encoded = toB64Url(username);
  const payload = `${encoded}.${exp}`;
  const key = await crypto.subtle.importKey(
    "raw",
    await getSecret(),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${toHex(sig)}`;
}

/** UTF-8 安全的 base64url(Edge 与 Node 通用) */
function toB64Url(str: string) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(str: string) {
  const bin = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** 校验 token,有效返回 username(已解码),否则返回 null */
export async function verifyAuthToken(token: string | undefined | null) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encoded, exp, sig] = parts;
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    await getSecret(),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = toHex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${encoded}.${exp}`)),
  );
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    return fromB64Url(encoded);
  } catch {
    return null;
  }
}

/** 校验登录凭据 */
export function validateCredentials(username: string, password: string) {
  const creds = getAuthCredentials();
  return (
    timingSafeEqual(username, creds.username) && timingSafeEqual(password, creds.password)
  );
}
