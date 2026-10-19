import { createHash } from "node:crypto";
import { and, desc, eq, gt, or, sql, type SQL } from "drizzle-orm";
import type { DB } from "../db/client";
import { programs, sourceCache, sources, zipUtilities } from "../db/schema";
import { normalizedProgramSchema, type NormalizedProgram, type ProgramView } from "../domain/program";
import { evaluateEligibility, type EligibilityResult } from "../eligibility/evaluate";
import { stateByAbbr } from "../geo/states";
import { lookupZip, type ZipInfo } from "../geo/zip";
import { collapseDuplicates } from "../pipeline/dedupe";
import { linkStatusFor } from "../pipeline/linkcheck";
import { staleCutoff } from "../pipeline/ingest";
import { upsertPrograms } from "../pipeline/ingest";
import { adapterById, onDemandAdapters } from "../sources/registry";
import { missingEnv, type SourceMeta } from "../sources/types";
import type { SensitiveParams, ShareableParams } from "./params";

export interface SourceStatus {
  id: string;
  name: string;
  kind: SourceMeta["kind"];
  /** ok | unavailable | not_configured | not_applicable | stale */
  state: "ok" | "unavailable" | "not_configured" | "not_applicable" | "stale";
  detail?: string;
  attribution?: string;
  homepage: string;
}

export interface SearchResult {
  location: { zip?: ZipInfo; state?: { abbr: string; name: string } } | null;
  programs: (ProgramView & { eligibility: ProgramView["eligibility"]; verdict: EligibilityResult })[];
  collapsed: Record<string, string[]>;
  sourcesStatus: SourceStatus[];
  utilities: string[];
  /** Why results might be incomplete; shown instead of "no programs exist". */
  coverageNotes: string[];
  emptyReason?: "no_location" | "no_matches" | "incomplete_coverage" | "source_unavailable" | "filters_too_restrictive" | "unsupported_area";
  totalBeforeFilters: number;
  screened: boolean;
}

const RA_CACHE_HOURS = Number(process.env.RA_CACHE_HOURS ?? 24);
const OPENEI_CACHE_HOURS = Number(process.env.OPENEI_CACHE_HOURS ?? 24 * 7);

function cacheKey(sourceId: string, zip: string, sensitive: SensitiveParams) {
  // Income etc. are hashed with a server-side salt so the cache key cannot be reversed into inputs.
  const salt = process.env.CACHE_SALT ?? "clearev-dev-salt";
  const h = createHash("sha256").update(`${salt}|${sensitive.householdIncome ?? ""}|${sensitive.householdSize ?? ""}|${sensitive.ownerStatus ?? ""}|${sensitive.taxFiling ?? ""}`).digest("hex").slice(0, 16);
  return `${sourceId}:${zip}:${h}`;
}

function rowToView(r: typeof programs.$inferSelect, meta: SourceMeta | undefined, srcRow?: typeof sources.$inferSelect): ProgramView {
  const p = normalizedProgramSchema.parse({
    ...r,
    descriptionHtml: r.descriptionHtml ?? undefined,
    stackingNote: r.stackingNote ?? undefined,
    providerLocation: r.providerLocation ?? undefined,
    applicationUrl: r.applicationUrl ?? undefined,
    startDate: r.startDate ?? undefined,
    endDate: r.endDate ?? undefined,
    fundingNote: r.fundingNote ?? undefined,
    retrievedAt: r.retrievedAt.toISOString(),
    lastVerifiedAt: r.lastVerifiedAt?.toISOString(),
  });
  const stale = meta ? r.retrievedAt < staleCutoff(meta.staleAfterDays) : false;
  return {
    ...p,
    reviewState: r.reviewState as ProgramView["reviewState"],
    sourceName: srcRow?.name ?? meta?.name ?? r.sourceId,
    sourceAttribution: srcRow?.attribution ?? meta?.attribution ?? undefined,
    stale,
    sourceUnavailableSince: r.sourceUnavailableSince?.toISOString(),
  };
}

export async function getProgram(db: DB, id: string): Promise<ProgramView | null> {
  const [row] = await db.select().from(programs).where(eq(programs.id, id)).limit(1);
  if (!row || row.reviewState === "rejected") return null;
  const [src] = await db.select().from(sources).where(eq(sources.id, row.sourceId));
  const view = rowToView(row, adapterById(row.sourceId)?.meta, src);
  const links = await linkStatusFor(db, [view.programUrl, ...(view.applicationUrl ? [view.applicationUrl] : [])]);
  view.linkStatus = links.get(view.programUrl);
  return view;
}

/** Keyword match on name, provider, summary (simple, case-insensitive; no external search service). */
function keywordClause(q: string): SQL {
  const like = `%${q.replace(/[%_]/g, " ")}%`;
  return or(sql`${programs.name} ILIKE ${like}`, sql`${programs.providerName} ILIKE ${like}`, sql`${programs.summary} ILIKE ${like}`)!;
}

export async function search(db: DB, params: ShareableParams, sensitive: SensitiveParams = {}, env: Record<string, string | undefined> = process.env): Promise<SearchResult> {
  const zip = params.zip ? lookupZip(params.zip) : null;
  const stateAbbr = zip?.state ?? params.state;
  const st = stateByAbbr(stateAbbr);
  const coverageNotes: string[] = [];
  const sourcesStatus: SourceStatus[] = [];
  const srcRows = new Map((await db.select().from(sources)).map((s) => [s.id, s]));
  const screened = sensitive.householdIncome != null;

  if (params.zip && !zip) {
    return { location: null, programs: [], collapsed: {}, sourcesStatus, utilities: [], coverageNotes: [`ZIP code ${params.zip} is not in the Census ZIP Code Tabulation Area list ClearEV uses. PO-box-only ZIPs are not covered; try a nearby residential ZIP.`], emptyReason: "no_location", totalBeforeFilters: 0, screened };
  }
  if (zip && !zip.supported) {
    return { location: { zip }, programs: [], collapsed: {}, sourcesStatus, utilities: [], coverageNotes: [`${stateByAbbr(zip.state)?.name ?? zip.state} is outside ClearEV's current coverage (50 states and DC).`], emptyReason: "unsupported_area", totalBeforeFilters: 0, screened };
  }

  // 1. Stored programs: national + this state (+ unlocated when no location).
  const where: SQL[] = [eq(programs.reviewState, "published"), eq(programs.isFixture, false)];
  if (st) where.push(or(eq(programs.coverageType, "national"), sql`${st.abbr} = ANY(${programs.coverageStates})`)!);
  const rows = await db.select().from(programs).where(and(...where)).orderBy(desc(programs.updatedAt)).limit(2000);
  let list: ProgramView[] = rows.map((r) => rowToView(r, adapterById(r.sourceId)?.meta, srcRows.get(r.sourceId)));
  for (const a of adapterById("afdc") ? [adapterById("afdc")!, adapterById("federal_curated")!] : []) {
    const row = srcRows.get(a.meta.id);
    const configured = missingEnv(a.meta, env).length === 0;
    const count = list.filter((p) => p.sourceId === a.meta.id).length;
    sourcesStatus.push({
      id: a.meta.id,
      name: a.meta.name,
      kind: a.meta.kind,
      homepage: a.meta.homepage,
      attribution: a.meta.attribution,
      state: !configured ? "not_configured" : row?.lastSuccessAt == null ? "unavailable" : row.lastSuccessAt < staleCutoff(a.meta.staleAfterDays) ? "stale" : "ok",
      detail: !configured
        ? `Not connected: set ${missingEnv(a.meta, env).join(", ")}.`
        : row?.lastSuccessAt == null
          ? `No successful ingestion yet${row?.lastError ? ` (${row.lastError})` : ""}.`
          : `${count} program${count === 1 ? "" : "s"} for this area; last refreshed ${row.lastSuccessAt.toISOString().slice(0, 10)}.`,
    });
  }

  // 2. On-demand sources need a ZIP.
  let utilities: string[] = [];
  if (zip) {
    for (const a of onDemandAdapters()) {
      const miss = missingEnv(a.meta, env);
      if (miss.length) {
        sourcesStatus.push({ id: a.meta.id, name: a.meta.name, kind: a.meta.kind, homepage: a.meta.homepage, attribution: a.meta.attribution, state: "not_configured", detail: `Not connected: set ${miss.join(", ")}.` });
        continue;
      }
      const key = cacheKey(a.meta.id, zip.zip, a.meta.id === "rewiring_america" ? sensitive : {});
      const ttlHours = a.meta.id === "rewiring_america" ? Math.min(RA_CACHE_HOURS, 24) : OPENEI_CACHE_HOURS;
      const [cached] = await db.select().from(sourceCache).where(and(eq(sourceCache.key, key), gt(sourceCache.expiresAt, new Date()))).limit(1);
      try {
        let payload: { programs: NormalizedProgram[]; warnings: string[]; utilities?: string[] };
        if (cached) payload = cached.payload as typeof payload;
        else {
          const res = await a.query({ env, now: () => new Date(), log: () => {} }, { zip: zip.zip, lat: zip.lat, lng: zip.lng, state: zip.state }, {
            householdIncome: sensitive.householdIncome,
            householdSize: sensitive.householdSize,
            ownerStatus: sensitive.ownerStatus,
            taxFiling: sensitive.taxFiling,
          });
          payload = { programs: res.programs, warnings: res.warnings, utilities: res.utilities };
          await db
            .insert(sourceCache)
            .values({ key, sourceId: a.meta.id, payload, fetchedAt: new Date(), expiresAt: new Date(Date.now() + ttlHours * 3_600_000) })
            .onConflictDoUpdate({ target: sourceCache.key, set: { payload, fetchedAt: new Date(), expiresAt: new Date(Date.now() + ttlHours * 3_600_000) } });
          if (res.persist && res.programs.length) await upsertPrograms(db, a.meta.id, res.programs, { markMissing: false });
          if (res.utilities?.length) {
            for (const u of res.utilities) await db.insert(zipUtilities).values({ zip: zip.zip, utilityName: u, sourceId: a.meta.id, retrievedAt: new Date() }).onConflictDoNothing();
          }
          await db.update(sources).set({ lastRunAt: new Date(), lastSuccessAt: new Date(), lastError: null, consecutiveFailures: 0 }).where(eq(sources.id, a.meta.id));
        }
        const srcRow = srcRows.get(a.meta.id);
        const fresh = payload.programs.map((p) => ({ ...normalizedProgramSchema.parse(p), reviewState: "published" as const, sourceName: a.meta.name, sourceAttribution: a.meta.attribution, stale: false }));
        list = [...list.filter((p) => p.sourceId !== a.meta.id), ...fresh];
        utilities.push(...(payload.utilities ?? []));
        coverageNotes.push(...payload.warnings);
        sourcesStatus.push({ id: a.meta.id, name: a.meta.name, kind: a.meta.kind, homepage: a.meta.homepage, attribution: a.meta.attribution ?? srcRow?.attribution ?? undefined, state: "ok", detail: `${fresh.length} program${fresh.length === 1 ? "" : "s"} for ZIP ${zip.zip}${cached ? " (cached)" : ""}.` });
      } catch (e) {
        const msg = (e as Error).message;
        await db.update(sources).set({ lastRunAt: new Date(), lastError: msg, consecutiveFailures: sql`${sources.consecutiveFailures} + 1` }).where(eq(sources.id, a.meta.id));
        sourcesStatus.push({ id: a.meta.id, name: a.meta.name, kind: a.meta.kind, homepage: a.meta.homepage, attribution: a.meta.attribution, state: "unavailable", detail: `Temporarily unavailable: ${msg}` });
        coverageNotes.push(`${a.meta.name} could not be reached, so its programs for this ZIP are missing from these results.`);
        // Stored results from this source (if its terms allow persistence) stay in the list.
      }
    }
    utilities = [...new Set(utilities)];
    if (!utilities.length) {
      const stored = await db.select({ u: zipUtilities.utilityName }).from(zipUtilities).where(eq(zipUtilities.zip, zip.zip));
      utilities = [...new Set(stored.map((s) => s.u))];
    }
  } else {
    for (const a of onDemandAdapters()) {
      sourcesStatus.push({ id: a.meta.id, name: a.meta.name, kind: a.meta.kind, homepage: a.meta.homepage, attribution: a.meta.attribution, state: "not_applicable", detail: "Enter a ZIP code to query this source." });
    }
  }

  // 3. Dedupe across sources (never merges materially different offers).
  const { kept, collapsed } = collapseDuplicates(list, (sid) => adapterById(sid)?.meta.priority ?? 100);
  const totalBeforeFilters = kept.length;

  // 4. Filters.
  const q = params.q?.toLowerCase();
  const filtered = kept.filter((p) => {
    if (params.cat.length && !p.categories.some((c) => params.cat.includes(c))) return false;
    if (params.benefit.length && !p.benefitTypes.some((b) => params.benefit.includes(b))) return false;
    if (params.status.length && !params.status.includes(p.status)) return false;
    if (params.utility && !(p.coverage.utilityNames.some((u) => u.toLowerCase().includes(params.utility!.toLowerCase())) || p.providerName.toLowerCase().includes(params.utility.toLowerCase()))) return false;
    if (params.applicant && p.eligibility.applicant?.length && !p.eligibility.applicant.includes(params.applicant)) return false;
    if (params.deadlineBefore && (!p.endDate || p.endDate.slice(0, 10) > params.deadlineBefore)) return false;
    if (q && !`${p.name} ${p.providerName} ${p.summary}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const withVerdicts = filtered.map((p) => ({ ...p, verdict: evaluateEligibility(p, sensitive) }));
  withVerdicts.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  // 5. Honest empty-state reason.
  let emptyReason: SearchResult["emptyReason"];
  const anyUnavailable = sourcesStatus.some((s) => s.state === "unavailable");
  const anyNotConfigured = sourcesStatus.some((s) => s.state === "not_configured");
  if (!withVerdicts.length) {
    if (!st) emptyReason = "no_location";
    else if (totalBeforeFilters > 0) emptyReason = "filters_too_restrictive";
    else if (anyUnavailable) emptyReason = "source_unavailable";
    else if (anyNotConfigured) emptyReason = "incomplete_coverage";
    else emptyReason = "no_matches";
  }
  if (anyNotConfigured) coverageNotes.push("Some data sources are not connected in this deployment, so results for this area are incomplete.");
  if (st && !zip) coverageNotes.push("Utility rate plans and ZIP-level programs appear after you enter a ZIP code.");

  return {
    location: st ? { zip: zip ?? undefined, state: { abbr: st.abbr, name: st.name } } : null,
    programs: withVerdicts,
    collapsed: Object.fromEntries(collapsed),
    sourcesStatus,
    utilities,
    coverageNotes: [...new Set(coverageNotes)],
    emptyReason,
    totalBeforeFilters,
    screened,
  };
}

function rank(p: ProgramView & { verdict: EligibilityResult }) {
  const status = p.status === "active" ? 0 : p.status === "upcoming" ? 1 : p.status === "unknown" ? 2 : 3;
  const verdict = p.verdict.verdict === "verified" ? 0 : p.verdict.verdict === "relevant" ? 1 : p.verdict.verdict === "needs_info" ? 2 : 3;
  const scope = p.coverage.type === "utility" || p.coverage.type === "zip" ? 0 : p.coverage.type === "state" ? 1 : 2;
  return status * 100 + verdict * 10 + scope;
}

/** Counts of published programs per state for the map choropleth (national programs excluded). */
export async function stateCounts(db: DB): Promise<Record<string, number>> {
  const rows = await db
    .select({ state: sql<string>`s`, n: sql<number>`count(*)::int` })
    .from(sql`${programs}, unnest(${programs.coverageStates}) AS s`)
    .where(and(eq(programs.reviewState, "published"), eq(programs.isFixture, false)))
    .groupBy(sql`s`);
  return Object.fromEntries(rows.map((r) => [r.state, r.n]));
}

export async function keywordSuggest(db: DB, q: string) {
  return db.select({ id: programs.id, name: programs.name }).from(programs).where(and(eq(programs.reviewState, "published"), keywordClause(q))).limit(10);
}
