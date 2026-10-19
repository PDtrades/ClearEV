import { safeFetchJson } from "../security/http";
import { cleanText, safeHttpsUrl } from "../security/sanitize";
import { normalizedProgramSchema, type NormalizedProgram } from "../domain/program";
import type { AdapterContext, LocationQuery, OnDemandAdapter, OnDemandResult, SensitiveInputs, SourceMeta } from "./types";

/**
 * OpenEI Utility Rate Database (URDB), DOE/NREL, CC0 data. Queried per location to find (a) the
 * utilities serving a ZIP's area and (b) residential rate plans whose names mark them as EV or
 * time-of-use plans. Results may be persisted (CC0) and are cached for OPENEI_CACHE_HOURS.
 */
export const OPENEI_META: SourceMeta = {
  id: "openei_urdb",
  name: "OpenEI Utility Rate Database (DOE/NREL)",
  kind: "on_demand",
  homepage: "https://openei.org/wiki/Utility_Rate_Database",
  termsUrl: "https://openei.org/wiki/OpenEI:Copyrights",
  attribution: "Rate data: OpenEI Utility Rate Database (CC0), maintained by NREL with DOE funding",
  requiredEnv: ["NREL_API_KEY"],
  allowedHosts: ["api.openei.org"],
  covers: "Residential EV and time-of-use electricity rate plans from utilities whose service area includes the searched ZIP code, nationwide.",
  gaps: "URDB lists rate schedules, not rebates. Utility matching is by location radius, not a verified service-territory boundary. Rate details must be confirmed on the utility's page.",
  priority: 30,
  staleAfterDays: 30,
};

const API = "https://api.openei.org/utility_rates";

export interface UrdbRate {
  label: string;
  utility: string;
  name: string;
  uri?: string;
  sector?: string;
  description?: string;
  startdate?: number;
  enddate?: number;
  approved?: boolean;
  source?: string;
  eiaid?: number;
}

export const EV_RATE_RX = /\b(EV|electric vehicle|plug-in|PEV|vehicle charging)\b/i;
export const TOU_RX = /\b(time[- ]of[- ]use|TOU)\b/i;

export function normalizeUrdbRate(r: UrdbRate, loc: LocationQuery, retrievedAt: string): NormalizedProgram | null {
  if (!r.label || !r.utility || !r.name) return null;
  const isEv = EV_RATE_RX.test(r.name) || EV_RATE_RX.test(r.description ?? "");
  const isTou = TOU_RX.test(r.name);
  if (!isEv && !isTou) return null;
  const pageUrl = safeHttpsUrl(r.uri) ?? `https://apps.openei.org/USURDB/rate/view/${encodeURIComponent(r.label)}`;
  const utilityUrl = safeHttpsUrl(r.source);
  const ended = r.enddate ? new Date(r.enddate * 1000) < new Date(retrievedAt) : false;
  return normalizedProgramSchema.parse({
    id: `openei_urdb:${r.label}`,
    sourceId: "openei_urdb",
    externalId: r.label,
    name: cleanText(`${r.utility}: ${r.name}`, 300),
    providerName: cleanText(r.utility, 200),
    providerType: "utility",
    categories: ["utility_rate"],
    benefitTypes: ["rate_plan"],
    summary: cleanText(r.description, 500) || `${isEv ? "An electric-vehicle" : "A time-of-use"} residential rate plan from ${cleanText(r.utility, 200)}. Rate plans change what you pay per kWh by time of day; they are not rebates.`,
    amounts: [],
    stackingNote: "A rate plan is not a rebate; it can usually be combined with purchase incentives.",
    coverage: {
      type: "utility",
      states: [loc.state],
      counties: [],
      zips: [],
      utilityNames: [r.utility],
      confidence: "source_stated",
      note: `OpenEI lists ${r.utility} as serving the area around ZIP ${loc.zip}. Only customers of this utility can enroll, and the match is by location, not a verified service boundary.`,
    },
    eligibility: {
      summary: [`Must be a residential customer of ${r.utility}.`],
      applicant: ["residential"],
      utilityCustomersOf: [r.utility],
      restrictions: isEv ? ["EV-specific rates usually require proof of EV ownership or a separate meter; see the utility's page."] : [],
    },
    application: {
      steps: [
        `Open the rate details to review the schedule${utilityUrl ? " and the utility's source document" : ""}.`,
        `Contact ${r.utility} or log in to your utility account to request enrollment in this rate.`,
      ],
      documents: [],
    },
    programUrl: utilityUrl ?? pageUrl,
    applicationUrl: utilityUrl,
    startDate: r.startdate ? new Date(r.startdate * 1000).toISOString().slice(0, 10) : undefined,
    endDate: r.enddate ? new Date(r.enddate * 1000).toISOString().slice(0, 10) : undefined,
    status: ended ? "closed" : "active",
    statusBasis: ended ? "The URDB entry has an end date in the past." : r.approved ? "The URDB entry is marked approved (expert verified) and has no end date in the past." : "Listed in the URDB without an end date; the entry is not marked approved by an OpenEI reviewer.",
    sourceUrl: pageUrl,
    retrievedAt,
    lastVerifiedAt: retrievedAt,
    verificationMethod: "Live query to the OpenEI Utility Rate Database API. Rate schedules are collected by Illinois State University for DOE.",
    uncertainties: ["Current enrollment conditions and prices must be confirmed with the utility."],
    evidence: { listing: { quote: `${r.utility} — ${r.name}`, url: pageUrl, retrievedAt } },
  });
}

export const openeiAdapter: OnDemandAdapter = {
  meta: OPENEI_META,
  async query(ctx: AdapterContext, loc: LocationQuery, _sensitive: SensitiveInputs): Promise<OnDemandResult> {
    const qs = new URLSearchParams({
      version: "8",
      format: "json",
      api_key: ctx.env.NREL_API_KEY!,
      lat: String(loc.lat),
      lon: String(loc.lng),
      radius: "5",
      sector: "Residential",
      detail: "minimal",
      limit: "500",
    });
    const retrievedAt = ctx.now().toISOString();
    const res = await safeFetchJson<{ items?: UrdbRate[]; errors?: string[] }>(`${API}?${qs}`, { allowedHosts: OPENEI_META.allowedHosts }, ctx.fetchImpl);
    if (res.errors?.length) throw new Error(`OpenEI: ${res.errors.join("; ")}`);
    const items = res.items ?? [];
    const utilities = [...new Set(items.map((r) => r.utility).filter(Boolean))];
    const programs = items.map((r) => normalizeUrdbRate(r, loc, retrievedAt)).filter((p): p is NormalizedProgram => !!p);
    return { programs, warnings: [], utilities, persist: true };
  },
};
