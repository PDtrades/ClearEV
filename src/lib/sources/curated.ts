import fs from "node:fs";
import path from "node:path";
import { safeFetch } from "../security/http";
import { htmlToText } from "../security/sanitize";
import { normalizedProgramSchema, type Evidence, type NormalizedProgramInput } from "../domain/program";
import type { AdapterContext, BulkAdapter, BulkResult, SourceMeta } from "./types";

/**
 * Curated records: hand-reviewed programs whose key values each carry a verbatim quote from the
 * official page. On every ingestion run the adapter re-fetches each official page and checks that
 * every quote is still present. A missing quote marks the record for review ("quote not found on
 * page") instead of silently keeping or changing the value.
 */
export const FEDERAL_META: SourceMeta = {
  id: "federal_curated",
  name: "Federal tax credits (IRS pages, curated)",
  kind: "curated",
  homepage: "https://www.irs.gov/credits-deductions/clean-vehicle-and-energy-credits",
  attribution: "Values quoted from official IRS pages",
  requiredEnv: [],
  allowedHosts: ["www.irs.gov"],
  covers: "The federal EV, used-EV, home-charger, and residential solar/battery tax credits (IRC 30D, 25E, 30C, 25D), with their current termination dates.",
  gaps: "Only these four federal credits. State, utility, and company programs come from other sources.",
  priority: 5,
  staleAfterDays: 60,
};

interface CuratedFile {
  reviewedAt: string;
  records: (Omit<NormalizedProgramInput, "sourceId" | "retrievedAt" | "evidence"> & { statusEvidence?: Evidence })[];
}

export function loadCuratedFile(file: string): CuratedFile {
  return JSON.parse(fs.readFileSync(file, "utf8")) as CuratedFile;
}

export function collectQuotes(rec: CuratedFile["records"][number]): Evidence[] {
  const out: Evidence[] = [];
  for (const a of rec.amounts ?? []) if (a.evidence) out.push(a.evidence);
  const inc = rec.eligibility?.income;
  if (inc && "evidence" in inc && inc.evidence) out.push(inc.evidence);
  if (rec.eligibility?.vehicle?.evidence) out.push(rec.eligibility.vehicle.evidence);
  if (rec.statusEvidence) out.push(rec.statusEvidence);
  return out;
}

const norm = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").toLowerCase();

export function quoteAppears(pageText: string, quote: string): boolean {
  return norm(pageText).includes(norm(quote));
}

export function makeCuratedAdapter(meta: SourceMeta, file: string): BulkAdapter {
  return {
    meta,
    async fetchAll(ctx: AdapterContext): Promise<BulkResult> {
      const data = loadCuratedFile(file);
      const result: BulkResult = { records: [], warnings: [], rejected: [] };
      const pages = new Map<string, string | null>();
      const retrievedAt = ctx.now().toISOString();
      const getPage = async (url: string) => {
        if (pages.has(url)) return pages.get(url)!;
        try {
          const { body } = await safeFetch(url, { allowedHosts: meta.allowedHosts, retries: 2 }, ctx.fetchImpl);
          pages.set(url, htmlToText(body));
        } catch (e) {
          result.warnings.push(`Could not fetch ${url}: ${(e as Error).message}`);
          pages.set(url, null);
        }
        return pages.get(url)!;
      };
      for (const rec of data.records) {
        const uncertainties = [...(rec.uncertainties ?? [])];
        let verified = 0;
        let checked = 0;
        for (const ev of collectQuotes(rec)) {
          const page = await getPage(ev.url);
          if (page == null) continue;
          checked++;
          if (quoteAppears(page, ev.quote)) verified++;
          else uncertainties.push(`REVIEW: quote not found on page: "${ev.quote.slice(0, 80)}"`);
        }
        const { statusEvidence, ...rest } = rec;
        const parsed = normalizedProgramSchema.safeParse({
          ...rest,
          sourceId: meta.id,
          retrievedAt,
          lastVerifiedAt: checked > 0 && verified === checked ? retrievedAt : `${data.reviewedAt}T00:00:00Z`,
          verificationMethod:
            checked > 0
              ? `${rec.verificationMethod} Last run: ${verified}/${checked} quotes found on the official page.`
              : `${rec.verificationMethod} The official page could not be reached on the last run; values are as reviewed on ${data.reviewedAt}.`,
          uncertainties,
          evidence: statusEvidence ? { status: statusEvidence } : {},
        });
        if (!parsed.success) result.rejected.push({ externalId: rec.externalId, reason: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
        else result.records.push(parsed.data);
      }
      return result;
    },
  };
}

export const federalAdapter = makeCuratedAdapter(FEDERAL_META, path.join(process.cwd(), "data/curated/federal.json"));

const STATES_FILE = path.join(process.cwd(), "data/curated/states.json");

/** Hosts the state records quote from; the adapter may fetch only these pages to re-check quotes. */
function hostsOf(file: string): string[] {
  try {
    const data = loadCuratedFile(file);
    const urls = data.records.flatMap((r) => [r.programUrl, r.sourceUrl, ...collectQuotes(r).map((e) => e.url)]);
    return [...new Set(urls.map((u) => new URL(u).hostname))].sort();
  } catch {
    return [];
  }
}

export const STATE_META: SourceMeta = {
  id: "state_curated",
  name: "State and regional programs (official pages, curated)",
  kind: "curated",
  homepage: "https://afdc.energy.gov/laws/state",
  attribution: "Values quoted from official state and regional program pages",
  requiredEnv: [],
  allowedHosts: hostsOf(STATES_FILE),
  covers: "A hand-reviewed starter set of open state and regional EV, charger, solar and battery programs, each value quoted from the official program page.",
  gaps: "A starter set, not every state program. The DOE Alternative Fuels Data Center feed adds the full state list once its API key is set.",
  priority: 6,
  staleAfterDays: 30,
};

export const stateAdapter = makeCuratedAdapter(STATE_META, STATES_FILE);

const LOCAL_FILE = path.join(process.cwd(), "data/curated/local.json");

export const LOCAL_META: SourceMeta = {
  id: "local_curated",
  name: "Utility, county and city programs (official pages, curated)",
  kind: "curated",
  homepage: "https://afdc.energy.gov/laws/state",
  attribution: "Values quoted from official utility, county and city program pages",
  requiredEnv: [],
  allowedHosts: hostsOf(LOCAL_FILE),
  covers: "A hand-reviewed set of open utility, county and city EV, charger, rate, solar and battery programs, each value quoted from the official program page.",
  gaps: "Not every utility or city. 17 states have no local records yet (AK, DE, IA, ID, KS, KY, MD, ME, MT, NC, NE, NV, OH, PA, SC, WV, WY), and utility programs are matched by state unless the page names counties.",
  priority: 7,
  staleAfterDays: 30,
};

export const localAdapter = makeCuratedAdapter(LOCAL_META, LOCAL_FILE);
