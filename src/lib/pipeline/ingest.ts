import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, lt, notInArray, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { ingestionRuns, programRevisions, programs, reviewItems, sources } from "../db/schema";
import { normalizedProgramSchema, type NormalizedProgram, type NormalizedProgramInput } from "../domain/program";
import { bulkAdapters } from "../sources/registry";
import { missingEnv, type AdapterContext, type BulkAdapter } from "../sources/types";
import { findDuplicates } from "./dedupe";

/** Fields whose change is "material": a snapshot is kept and, for amounts/status/url, a review item is opened. */
const MATERIAL_FIELDS: (keyof NormalizedProgram)[] = [
  "name", "providerName", "categories", "benefitTypes", "summary", "amounts", "coverage", "eligibility",
  "application", "programUrl", "applicationUrl", "startDate", "endDate", "status", "fundingNote",
];
const REVIEW_FIELDS = new Set<keyof NormalizedProgram>(["amounts", "status", "programUrl", "applicationUrl", "endDate", "coverage"]);

export function contentHash(p: NormalizedProgram): string {
  const subset: Record<string, unknown> = {};
  for (const f of MATERIAL_FIELDS) subset[f] = p[f];
  return createHash("sha256").update(JSON.stringify(subset)).digest("hex").slice(0, 32);
}

function changedFields(prev: Record<string, unknown>, next: NormalizedProgram): string[] {
  return MATERIAL_FIELDS.filter((f) => JSON.stringify(prev[f] ?? null) !== JSON.stringify(next[f] ?? null));
}

function toRow(p: NormalizedProgram, hash: string, raw?: unknown) {
  return {
    id: p.id,
    sourceId: p.sourceId,
    externalId: p.externalId,
    name: p.name,
    providerName: p.providerName,
    providerType: p.providerType,
    categories: p.categories,
    benefitTypes: p.benefitTypes,
    summary: p.summary,
    descriptionHtml: p.descriptionHtml ?? null,
    amounts: p.amounts,
    stackingNote: p.stackingNote ?? null,
    coverage: p.coverage,
    coverageStates: p.coverage.states,
    coverageType: p.coverage.type,
    providerLocation: p.providerLocation ?? null,
    eligibility: p.eligibility,
    application: p.application,
    programUrl: p.programUrl,
    applicationUrl: p.applicationUrl ?? null,
    startDate: p.startDate ?? null,
    endDate: p.endDate ?? null,
    status: p.status,
    statusBasis: p.statusBasis,
    fundingNote: p.fundingNote ?? null,
    sourceUrl: p.sourceUrl,
    retrievedAt: new Date(p.retrievedAt),
    lastVerifiedAt: p.lastVerifiedAt ? new Date(p.lastVerifiedAt) : null,
    verificationMethod: p.verificationMethod,
    uncertainties: p.uncertainties,
    evidence: p.evidence,
    rawPayload: raw ?? null,
    contentHash: hash,
    isFixture: p.isFixture,
    sourceUnavailableSince: null,
    updatedAt: new Date(),
  };
}

export interface UpsertStats {
  inserted: number;
  updated: number;
  unchanged: number;
  flagged: number;
  missing: number;
  rejected: number;
}

/**
 * Writes one source's records. Records that the source no longer returns are NOT deleted: they get
 * `sourceUnavailableSince` and a review item, and stay visible with a warning until a human decides.
 */
export async function upsertPrograms(db: DB, sourceId: string, inputs: NormalizedProgramInput[], opts: { allowFixtures?: boolean; markMissing?: boolean } = {}): Promise<UpsertStats & { rejectedReasons: string[] }> {
  const stats: UpsertStats & { rejectedReasons: string[] } = { inserted: 0, updated: 0, unchanged: 0, flagged: 0, missing: 0, rejected: 0, rejectedReasons: [] };
  const seen = new Set<string>();
  const records: NormalizedProgram[] = [];
  for (const input of inputs) {
    const parsed = normalizedProgramSchema.safeParse(input);
    if (!parsed.success) {
      stats.rejected++;
      stats.rejectedReasons.push(`${input.id ?? "?"}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      continue;
    }
    const p = parsed.data;
    if (p.sourceId !== sourceId) {
      stats.rejected++;
      stats.rejectedReasons.push(`${p.id}: sourceId mismatch`);
      continue;
    }
    if (p.isFixture && !opts.allowFixtures) {
      stats.rejected++;
      stats.rejectedReasons.push(`${p.id}: fixture records are not accepted outside tests`);
      continue;
    }
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    records.push(p);
  }

  const existing = records.length
    ? await db.select().from(programs).where(inArray(programs.id, records.map((r) => r.id)))
    : [];
  const byId = new Map(existing.map((e) => [e.id, e]));

  for (const p of records) {
    const hash = contentHash(p);
    const prev = byId.get(p.id);
    if (!prev) {
      await db.insert(programs).values({ ...toRow(p, hash), reviewState: "published" });
      await db.insert(programRevisions).values({ programId: p.id, contentHash: hash, snapshot: p, changedFields: ["(new)"] });
      stats.inserted++;
      continue;
    }
    if (prev.contentHash === hash) {
      await db
        .update(programs)
        .set({ retrievedAt: new Date(p.retrievedAt), lastVerifiedAt: p.lastVerifiedAt ? new Date(p.lastVerifiedAt) : prev.lastVerifiedAt, sourceUnavailableSince: null, uncertainties: p.uncertainties, verificationMethod: p.verificationMethod, updatedAt: new Date() })
        .where(eq(programs.id, p.id));
      stats.unchanged++;
      continue;
    }
    const changed = changedFields(prev as unknown as Record<string, unknown>, p);
    const needsReview = changed.some((f) => REVIEW_FIELDS.has(f as keyof NormalizedProgram));
    // Human corrections (review_state=rejected or admin-edited) are not overwritten silently.
    await db
      .update(programs)
      .set({ ...toRow(p, hash), reviewState: prev.reviewState === "rejected" ? "rejected" : needsReview ? "needs_review" : "published" })
      .where(eq(programs.id, p.id));
    await db.insert(programRevisions).values({ programId: p.id, contentHash: hash, snapshot: p, changedFields: changed });
    if (needsReview) {
      await db.insert(reviewItems).values({ programId: p.id, sourceId, reason: "material_change", details: { changedFields: changed, before: pick(prev as unknown as Record<string, unknown>, changed), after: pick(p as unknown as Record<string, unknown>, changed) } });
      stats.flagged++;
    }
    stats.updated++;
  }

  if (opts.markMissing !== false) {
    const stale = await db
      .select({ id: programs.id })
      .from(programs)
      .where(and(eq(programs.sourceId, sourceId), isNull(programs.sourceUnavailableSince), records.length ? notInArray(programs.id, records.map((r) => r.id)) : sql`true`));
    for (const s of stale) {
      await db.update(programs).set({ sourceUnavailableSince: new Date(), updatedAt: new Date() }).where(eq(programs.id, s.id));
      await db.insert(reviewItems).values({ programId: s.id, sourceId, reason: "missing_from_source", details: { note: "The source no longer returns this record. It stays visible with a warning until reviewed." } });
      stats.missing++;
    }
  }

  // Duplicate detection across sources for the records just written.
  const dups = await findDuplicates(db, records);
  for (const d of dups) {
    await db.insert(reviewItems).values({ programId: d.programId, sourceId, reason: "possible_duplicate", details: { of: d.duplicateOf, score: d.score, why: d.why } });
  }
  return stats;
}

function pick(obj: Record<string, unknown>, keys: string[]) {
  const o: Record<string, unknown> = {};
  for (const k of keys) o[k] = obj[k];
  return o;
}

export interface RunOptions {
  db: DB;
  env?: Record<string, string | undefined>;
  only?: string[];
  trigger?: string;
  ctx?: Partial<AdapterContext>;
}

/** Runs every configured bulk adapter, recording an ingestion_runs row and source health. */
export async function runIngestion(opts: RunOptions): Promise<Record<string, { status: string; stats?: UpsertStats; warnings: string[]; error?: string }>> {
  const env = opts.env ?? process.env;
  const out: Record<string, { status: string; stats?: UpsertStats; warnings: string[]; error?: string }> = {};
  for (const adapter of bulkAdapters()) {
    if (opts.only && !opts.only.includes(adapter.meta.id)) continue;
    out[adapter.meta.id] = await runOne(opts.db, adapter, env, opts.trigger ?? "manual", opts.ctx);
  }
  return out;
}

export async function runOne(db: DB, adapter: BulkAdapter, env: Record<string, string | undefined>, trigger: string, ctx?: Partial<AdapterContext>) {
  const missing = missingEnv(adapter.meta, env);
  const [run] = await db.insert(ingestionRuns).values({ sourceId: adapter.meta.id, trigger, status: "running" }).returning({ id: ingestionRuns.id });
  if (missing.length) {
    const msg = `Skipped: missing ${missing.join(", ")}`;
    await db.update(ingestionRuns).set({ status: "skipped", finishedAt: new Date(), errors: [msg] }).where(eq(ingestionRuns.id, run.id));
    await db.update(sources).set({ configState: "missing_credentials" }).where(eq(sources.id, adapter.meta.id));
    return { status: "skipped", warnings: [msg] };
  }
  const startedAt = new Date();
  try {
    const result = await adapter.fetchAll({ env, now: () => new Date(), log: () => {}, ...ctx });
    const { rejectedReasons, ...stats } = await upsertPrograms(db, adapter.meta.id, result.records, { markMissing: result.records.length > 0 });
    const status = result.warnings.length || stats.rejected ? "partial" : "success";
    await db
      .update(ingestionRuns)
      .set({ status, finishedAt: new Date(), counts: { ...stats, adapterRejected: result.rejected.length }, errors: [...result.warnings, ...result.rejected.slice(0, 50).map((r) => `rejected ${r.externalId}: ${r.reason}`), ...rejectedReasons.slice(0, 50)] })
      .where(eq(ingestionRuns.id, run.id));
    await db.update(sources).set({ configState: "configured", lastRunAt: startedAt, lastSuccessAt: new Date(), lastError: null, consecutiveFailures: 0 }).where(eq(sources.id, adapter.meta.id));
    return { status, stats, warnings: result.warnings };
  } catch (e) {
    const msg = (e as Error).message;
    await db.update(ingestionRuns).set({ status: "failed", finishedAt: new Date(), errors: [msg] }).where(eq(ingestionRuns.id, run.id));
    await db.update(sources).set({ lastRunAt: startedAt, lastError: msg, consecutiveFailures: sql`${sources.consecutiveFailures} + 1` }).where(eq(sources.id, adapter.meta.id));
    return { status: "failed", warnings: [], error: msg };
  }
}

/** Marks records stale when their source has not confirmed them within the source's window. Pure query helper. */
export function staleCutoff(staleAfterDays: number, now = new Date()): Date {
  return new Date(now.getTime() - staleAfterDays * 86_400_000);
}

export async function countStale(db: DB, sourceId: string, staleAfterDays: number) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(programs)
    .where(and(eq(programs.sourceId, sourceId), lt(programs.retrievedAt, staleCutoff(staleAfterDays))));
  return n;
}
