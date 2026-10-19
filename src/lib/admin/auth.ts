import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Admin access: a single operator password (ADMIN_PASSWORD_HASH, scrypt) and a signed, httpOnly,
 * SameSite=strict session cookie (ADMIN_SESSION_SECRET). No password is ever stored in plain text.
 * Comparisons are constant-time. Login attempts are rate limited per process.
 */
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(pw, salt, 64).toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string | undefined): boolean {
  if (!stored) return false;
  const [algo, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const a = scryptSync(pw, salt, 64);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const SESSION_COOKIE = "clearev_admin";
const SESSION_HOURS = 8;

function secret() {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("ADMIN_SESSION_SECRET must be set (32+ characters)");
  return s;
}

export function createSessionToken(now = Date.now()): string {
  const exp = String(now + SESSION_HOURS * 3_600_000);
  const sig = createHmac("sha256", secret()).update(exp).digest("hex");
  return `${exp}.${sig}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < now) return false;
  const expect = createHmac("sha256", secret()).update(exp).digest("hex");
  return sig.length === expect.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expect));
}

export function adminConfigured(): boolean {
  return !!process.env.ADMIN_PASSWORD_HASH && !!process.env.ADMIN_SESSION_SECRET && process.env.ADMIN_SESSION_SECRET.length >= 32;
}

const attempts = new Map<string, { n: number; until: number }>();
export function loginAllowed(ip: string, now = Date.now()): boolean {
  const a = attempts.get(ip);
  return !a || a.until < now || a.n < 5;
}
export function recordLoginFailure(ip: string, now = Date.now()) {
  const a = attempts.get(ip);
  if (!a || a.until < now) attempts.set(ip, { n: 1, until: now + 15 * 60_000 });
  else a.n++;
}
