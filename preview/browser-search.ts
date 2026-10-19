// In-browser mirror of src/lib/search/service.ts for the static preview. It applies the same location,
// dedupe, filter, eligibility, ranking and empty-state rules to a snapshot of the published records.
import type { ProgramView } from "@/lib/domain/program";
import { evaluateEligibility, type EligibilityResult } from "@/lib/eligibility/evaluate";
import { stateByAbbr } from "@/lib/geo/states";
import { normalizeZip } from "@/lib/geo/zip-format";
import { lonLatToPseudo } from "@/lib/geo/projection";
import { collapseDuplicates } from "@/lib/pipeline/dedupe";
import type { SensitiveParams, ShareableParams } from "@/lib/search/params";
import type { SearchResult, SourceStatus } from "@/lib/search/service";
import type { ZipInfo } from "@/lib/geo/zip";
import { computeHotspots, type HotspotData } from "@/lib/search/hotspots";
import { outsideZipCounties, scopeRank, unconfirmedUtility, utilityNote } from "@/lib/search/locality";

export interface Snapshot {
  capturedAt: string;
  programs: ProgramView[];
  status: { none: SourceStatus[]; stored: SourceStatus[]; zip: SourceStatus[] };
  pages: Record<string, { title: string; html: string }>;
}
type ZctaFile = { zips: Record<string, [number, number, string, string, string[]]> };

const PRIORITY: Record<string, number> = { federal_curated: 5, state_curated: 6, local_curated: 7, rewiring_america: 10, afdc: 20, openei_urdb: 30 };

export function makeSearch(snap: Snapshot, zcta: ZctaFile, counties: Record<string, string>) {
  function lookupZip(input?: string): ZipInfo | null {
    const zip = normalizeZip(input);
    if (!zip) return null;
    const row = zcta.zips[zip];
    if (!row) return null;
    const [lat, lng, state, countyFips, others] = row;
    return { zip, lat, lng, state, countyFips, countyName: counties[countyFips], otherCountyFips: others, supported: !!stateByAbbr(state)?.supported };
  }

  return function search(params: ShareableParams, sensitive: SensitiveParams = {}): SearchResult & { zipPoint: [number, number] | null } {
    const zip = params.zip ? lookupZip(params.zip) : null;
    const st = stateByAbbr(zip?.state ?? params.state);
    const screened = sensitive.householdIncome != null;
    const base = { collapsed: {}, utilities: [] as string[], totalBeforeFilters: 0, screened, zipPoint: null };
    if (params.zip && !zip)
      return { ...base, location: null, programs: [], sourcesStatus: [], coverageNotes: [`ZIP code ${params.zip} is not in the Census ZIP Code Tabulation Area list ClearEV uses. PO-box-only ZIPs are not covered; try a nearby residential ZIP.`], emptyReason: "no_location" };
    if (zip && !zip.supported)
      return { ...base, location: { zip }, programs: [], sourcesStatus: [], coverageNotes: [`${stateByAbbr(zip.state)?.name ?? zip.state} is outside ClearEV's current coverage (50 states and DC).`], emptyReason: "unsupported_area" };

    const list = snap.programs.filter((p) => p.reviewState === "published" && (!st || p.coverage.type === "national" || p.coverage.states.includes(st.abbr)));
    const sourcesStatus: SourceStatus[] = zip ? [...snap.status.stored, ...snap.status.zip] : snap.status.none;
    const coverageNotes: string[] = [];
    const { kept: all, collapsed } = collapseDuplicates(list, (sid) => PRIORITY[sid] ?? 100);
    // County and city programs only where the source names this ZIP's county.
    const kept = all.filter((p) => !outsideZipCounties(p, zip));
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
    withVerdicts.sort((a, b) => rank(a, zip, []) - rank(b, zip, []) || a.name.localeCompare(b.name));

    let emptyReason: SearchResult["emptyReason"];
    const anyNotConfigured = sourcesStatus.some((s) => s.state === "not_configured");
    if (!withVerdicts.length) {
      if (!st) emptyReason = "no_location";
      else if (kept.length > 0) emptyReason = "filters_too_restrictive";
      else if (anyNotConfigured) emptyReason = "incomplete_coverage";
      else emptyReason = "no_matches";
    }
    if (anyNotConfigured) coverageNotes.push("Some data sources are not connected in this deployment, so results for this area are incomplete.");
    if (st && !zip) coverageNotes.push("Utility rate plans and ZIP-level programs appear after you enter a ZIP code.");
    if (st && zip && withVerdicts.some((p) => unconfirmedUtility(p, zip, []))) coverageNotes.push(utilityNote(st.name, zip.zip));
    return {
      location: st ? { zip: zip ?? undefined, state: { abbr: st.abbr, name: st.name } } : null,
      programs: withVerdicts,
      collapsed: Object.fromEntries(collapsed),
      sourcesStatus,
      utilities: [],
      coverageNotes: [...new Set(coverageNotes)],
      emptyReason,
      totalBeforeFilters: kept.length,
      screened,
      zipPoint: zip ? lonLatToPseudo(zip.lng, zip.lat) : null,
    };
  };
}

function rank(p: ProgramView & { verdict: EligibilityResult }, zip: Parameters<typeof scopeRank>[1], utilities: string[]) {
  const status = p.status === "active" ? 0 : p.status === "upcoming" ? 1 : p.status === "unknown" ? 2 : 3;
  const verdict = p.verdict.verdict === "verified" ? 0 : p.verdict.verdict === "relevant" ? 1 : p.verdict.verdict === "needs_info" ? 2 : 3;
  const scope = scopeRank(p, zip, utilities);
  return status * 100 + verdict * 10 + scope;
}

export function stateCountsFrom(programs: ProgramView[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of programs) if (p.reviewState === "published") for (const s of p.coverage.states) out[s] = (out[s] ?? 0) + 1;
  return out;
}

export function hotspotsFrom(programs: ProgramView[], counties: Record<string, string>): HotspotData {
  const data = computeHotspots(programs.filter((p) => p.coverage.type !== "national"));
  for (const c of data.counties) c.name = counties[c.key];
  return data;
}
