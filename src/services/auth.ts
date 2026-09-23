import { CONFIG } from '../config.ts';

// 认证（plan §27）：密码哈希用 WebCrypto PBKDF2-SHA256（Cloudflare 环境可靠方案；
// 换 Argon2id 只需替换 hashPassword/verifyPassword）。迭代数受 workerd 上限约束，见下。
// Session 用 HMAC 签名 Cookie（HttpOnly + Secure + SameSite=Lax），服务端无状态。
// 100000 是 workerd WebCrypto 的 PBKDF2 硬上限（生产实测：deriveBits 超过即抛
// "iteration counts above 100000 are not supported"）；本地 node 测试无此限制。
const ITERATIONS = 100_000;
const enc = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterText, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'pbkdf2') return false;
  try {
    const actual = await pbkdf2(password, fromHex(saltHex), Number(iterText));
    return timingSafeEqual(actual, fromHex(hashHex));
  } catch {
    return false;
  }
}

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return toHex(new Uint8Array(sig));
}

export async function makeSession(userId: string, secret: string, nowMs: number): Promise<string> {
  const exp = nowMs + CONFIG.SESSION_TTL_MS;
  const payload = `${userId}.${exp}`;
  return `${payload}.${await hmac(payload, secret)}`;
}

export async function verifySession(token: string, secret: string, nowMs: number): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, expText, sig] = parts;
  const payload = `${userId}.${expText}`;
  if (!timingSafeEqual(enc.encode(await hmac(payload, secret)), enc.encode(sig))) return null;
  if (nowMs >= Number(expText)) return null;
  return userId;
}

export function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

export function sessionCookie(token: string): string {
  return `sid=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(CONFIG.SESSION_TTL_MS / 1000)}`;
}

export function clearCookie(): string {
  return 'sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}
