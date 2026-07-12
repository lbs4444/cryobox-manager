import { cookies, headers } from "next/headers";
import { createHmac, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getPool } from "./db";

const scrypt = promisify(nodeScrypt);
const SESSION_COOKIE = "cryobox_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const rateState = new Map<string, { count: number; resetAt: number; blockedUntil: number }>();

export interface AuthUser { id: string; email: string; }

function base64url(value: string | Uint8Array) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64url(value: string) {
  return Buffer.from(value, "base64url");
}

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET 至少需要 32 个字符");
  return value;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = (await scrypt(password, salt, 32)) as Buffer;
  return `scrypt$16384$8$1$${base64url(salt)}$${base64url(key)}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, nText, rText, pText, saltText, keyText] = encoded.split("$");
  if (algorithm !== "scrypt" || !nText || !rText || !pText || !saltText || !keyText) return false;
  const expected = fromBase64url(keyText);
  if (Number(nText) !== 16_384 || Number(rText) !== 8 || Number(pText) !== 1) return false;
  const actual = (await scrypt(password, fromBase64url(saltText), expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function sign(payload: string) {
  return base64url(createHmac("sha256", secret()).update(payload).digest());
}

function createToken(user: AuthUser) {
  const payload = base64url(JSON.stringify({ sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS }));
  return `${payload}.${sign(payload)}`;
}

function readToken(value: string | undefined): AuthUser | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  const expectedSignature = Buffer.from(sign(payload ?? ""));
  const actualSignature = Buffer.from(signature ?? "");
  if (!payload || !signature || actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) return null;
  try {
    const parsed = JSON.parse(fromBase64url(payload).toString("utf8")) as { sub?: string; email?: string; exp?: number };
    return parsed.sub && parsed.email && parsed.exp && parsed.exp > Math.floor(Date.now() / 1000) ? { id: parsed.sub, email: parsed.email } : null;
  } catch { return null; }
}

export function clientAddress(requestHeaders: Headers) {
  return requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown";
}

export function rateLimit(key: string, max = 12, windowMs = 10 * 60_000) {
  const now = Date.now();
  const current = rateState.get(key);
  if (current?.blockedUntil && current.blockedUntil > now) return false;
  if (!current || current.resetAt <= now) {
    rateState.set(key, { count: 1, resetAt: now + windowMs, blockedUntil: 0 });
    return true;
  }
  current.count += 1;
  if (current.count > max) { current.blockedUntil = now + 15 * 60_000; return false; }
  return true;
}

export async function currentUser() {
  const jar = await cookies();
  const tokenUser = readToken(jar.get(SESSION_COOKIE)?.value);
  if (!tokenUser) return null;
  const result = await getPool().query<{ id: string; email: string }>("select id, email from app_users where id = $1", [tokenUser.id]);
  return result.rows[0] ?? null;
}

export async function setSession(user: AuthUser) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 0, path: "/" });
}

export async function requestClientAddress() {
  return clientAddress(await headers());
}

export { SESSION_COOKIE };
