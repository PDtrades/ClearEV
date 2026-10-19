import { eq, inArray } from "drizzle-orm";
import type { DB } from "../db/client";
import { linkChecks, programs, reviewItems } from "../db/schema";
import { safeFetch, type FetchImpl } from "../security/http";

/**
 * Checks official program and application links. Any https host is allowed here (the URLs come from
 * verified sources, never from users), but the fetch still goes through safeFetch for timeouts,
 * size limits, and redirect re-validation. A link is reported broken only after 3 consecutive failures,
 * so a transient outage does not flag hundreds of programs.
 */
export async function checkLinks(db: DB, opts: { limit?: number; fetchImpl?: FetchImpl; olderThanHours?: number } = {}) {
  const limit = opts.limit ?? 200;
  const cutoff = new Date(Date.now() - (opts.olderThanHours ?? 24 * 7) * 3_600_000);
  const rows = await db
    .select({ id: programs.id, programUrl: programs.programUrl, applicationUrl: programs.applicationUrl })
    .from(programs)
    .where(eq(programs.reviewState, "published"));
  const urls = new Map<string, string[]>();
  for (const r of rows) {
    for (const u of [r.programUrl, r.applicationUrl]) {
      if (!u) continue;
      urls.set(u, [...(urls.get(u) ?? []), r.id]);
    }
  }
  const previous = new Map((await db.select().from(linkChecks)).map((l) => [l.url, l]));
  const due = [...urls.keys()].filter((u) => !previous.has(u) || previous.get(u)!.checkedAt < cutoff).slice(0, limit);
  const summary = { checked: 0, ok: 0, broken: 0, newlyBroken: 0 };
  for (const url of due) {
    let status: number | undefined;
    let ok = false;
    let error: string | undefined;
    try {
      const host = new URL(url).hostname;
      let res = await safeFetch(url, { allowedHosts: [host], method: "HEAD", acceptAnyStatus: true, retries: 1, timeoutMs: 15_000 }, opts.fetchImpl);
      if (res.status === 405 || res.status === 403 || res.status === 404) {
        res = await safeFetch(url, { allowedHosts: [host], method: "GET", acceptAnyStatus: true, retries: 1, timeoutMs: 15_000, maxBytes: 2_000_000 }, opts.fetchImpl);
      }
      status = res.status;
      ok = res.status >= 200 && res.status < 400;
    } catch (e) {
      error = (e as Error).message;
    }
    const prev = previous.get(url);
    const failures = ok ? 0 : (prev?.consecutiveFailures ?? 0) + 1;
    await db
      .insert(linkChecks)
      .values({ url, checkedAt: new Date(), httpStatus: status ?? null, ok, error: error ?? null, consecutiveFailures: failures })
      .onConflictDoUpdate({ target: linkChecks.url, set: { checkedAt: new Date(), httpStatus: status ?? null, ok, error: error ?? null, consecutiveFailures: failures } });
    summary.checked++;
    if (ok) summary.ok++;
    else summary.broken++;
    if (failures === 3) {
      summary.newlyBroken++;
      for (const pid of urls.get(url) ?? []) {
        await db.insert(reviewItems).values({ programId: pid, reason: "broken_link", details: { url, status, error } });
      }
    }
  }
  return summary;
}

export async function linkStatusFor(db: DB, urls: string[]): Promise<Map<string, "ok" | "broken" | "unchecked">> {
  const out = new Map<string, "ok" | "broken" | "unchecked">();
  if (!urls.length) return out;
  const rows = await db.select().from(linkChecks).where(inArray(linkChecks.url, urls));
  for (const u of urls) out.set(u, "unchecked");
  for (const r of rows) out.set(r.url, r.ok ? "ok" : r.consecutiveFailures >= 3 ? "broken" : "ok");
  return out;
}
