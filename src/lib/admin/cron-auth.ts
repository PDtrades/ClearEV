import { timingSafeEqual } from "node:crypto";

/** Scheduled refresh endpoints require `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends this header). */
export function cronAuthorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || !header) return false;
  const given = header.replace(/^Bearer\s+/i, "");
  return given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}
