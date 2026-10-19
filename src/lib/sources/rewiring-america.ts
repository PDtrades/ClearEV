import { safeFetchJson } from "../security/http";
import { cleanText, safeHttpsUrl } from "../security/sanitize";
import { stateByAbbr } from "../geo/states";
import { normalizedProgramSchema, type Amount, type BenefitType, type Category, type NormalizedProgram, type ProviderType } from "../domain/program";
import type { AdapterContext, LocationQuery, OnDemandAdapter, OnDemandResult, SensitiveInputs, SourceMeta } from "./types";

/**
 * Rewiring America Incentives API (https://docs.rewiringamerica.org). Queried per location, on
 * demand, because the API requires household income, size, and owner status as inputs, and its terms
 * forbid systematic copying or caching results for more than 24 hours. Results are cached for at most
 * RA_CACHE_HOURS (default 24) under a key that hashes, never stores, the sensitive inputs.
 *
 * Terms (reviewed 2026-10-19): credit "Rewiring America" and link to rewiringamerica.org alongside
 * results; show users a privacy notice; default limits 500 req/min, 100,000 req/day.
 */
export const RA_META: SourceMeta = {
  id: "rewiring_america",
  name: "Rewiring America Incentives API",
  kind: "on_demand",
  homepage: "https://www.rewiringamerica.org",
  termsUrl: "https://www.rewiringamerica.org/tools/incentive-api-terms",
  attribution: "Incentive data by Rewiring America (rewiringamerica.org)",
  requiredEnv: ["REWIRING_AMERICA_API_KEY"],
  allowedHosts: ["api.rewiringamerica.org"],
  covers:
    "Federal, state, utility, and local incentives for rooftop solar, battery storage, EV chargers, new and used EVs and plug-in hybrids, by ZIP code, with income-screened eligibility.",
  gaps:
    "Returns only what Rewiring America tracks for the ZIP; its coverage object says whether the state and utilities are covered. Requires household income, size, and owner status; ClearEV sends defaults when the user leaves them blank and labels results accordingly.",
  priority: 10,
  staleAfterDays: 2,
};

const API = "https://api.rewiringamerica.org/api/v1/calculator";

/** Rewiring America item keys ClearEV requests (its 46-value enum includes many non-EV upgrades). */
export const RA_ITEMS = [
  "new_electric_vehicle",
  "used_electric_vehicle",
  "new_plugin_hybrid_vehicle",
  "used_plugin_hybrid_vehicle",
  "electric_vehicle_charger",
  "rooftop_solar_installation",
  "battery_storage_installation",
  "ebike",
] as const;

const ITEM_CATEGORY: Record<string, Category> = {
  new_electric_vehicle: "ev_purchase",
  used_electric_vehicle: "ev_purchase",
  new_plugin_hybrid_vehicle: "ev_purchase",
  used_plugin_hybrid_vehicle: "ev_purchase",
  electric_vehicle_charger: "home_charging",
  rooftop_solar_installation: "solar",
  battery_storage_installation: "battery",
  ebike: "other",
};
const PAYMENT_BENEFIT: Record<string, BenefitType> = {
  rebate: "post_purchase_rebate",
  pos_rebate: "pos_rebate",
  tax_credit: "tax_credit",
  account_credit: "bill_credit",
  assistance_program: "assistance",
  performance_rebate: "post_purchase_rebate",
  unknown: "other",
};
const AUTHORITY_PROVIDER: Record<string, ProviderType> = {
  federal: "federal",
  state: "state",
  city: "local",
  county: "local",
  utility: "utility",
  gas_utility: "utility",
  other: "other",
};

export interface RaIncentive {
  payment_methods: string[];
  authority_type: string;
  authority?: string;
  program: string;
  program_url: string;
  more_info_url?: string;
  items: string[];
  amount: { type: "dollar_amount" | "percent" | "dollars_per_unit" | string; number: number; maximum?: number; representative?: number; unit?: string };
  owner_status: string[];
  start_date?: string;
  end_date?: string;
  short_description?: string;
  paused?: boolean;
  eligible?: boolean;
}
export interface RaResponse {
  is_under_80_ami: boolean;
  is_under_150_ami: boolean;
  is_over_150_ami: boolean;
  authorities: Record<string, { name: string; logo?: unknown }>;
  coverage: { state: string | null; utility: string | null; [k: string]: unknown };
  location: { state: string; city?: string; zip?: string };
  incentives: RaIncentive[];
  data_partners?: Record<string, { name: string; logo?: unknown }>;
}

function amountOf(i: RaIncentive, url: string, retrievedAt: string): Amount {
  const a = i.amount;
  const ev = { quote: `amount: ${JSON.stringify(a)}`, url, retrievedAt };
  if (a.type === "dollar_amount") return { kind: "flat", value: a.number, label: `Up to $${a.number.toLocaleString()}`, evidence: ev };
  if (a.type === "percent") {
    const pct = Math.round(a.number * 100);
    return { kind: "percent", value: pct, maximum: a.maximum, label: a.maximum ? `${pct}% of cost, up to $${a.maximum.toLocaleString()}` : `${pct}% of cost`, evidence: ev };
  }
  if (a.type === "dollars_per_unit")
    return { kind: "per_unit", value: a.number, maximum: a.maximum, unit: a.unit, label: `$${a.number.toLocaleString()} per ${a.unit ?? "unit"}${a.maximum ? `, up to $${a.maximum.toLocaleString()}` : ""}`, evidence: ev };
  return { kind: "text", label: `Amount type ${a.type}: ${a.number}`, evidence: ev };
}

export function stableRaId(i: RaIncentive): string {
  const base = `${i.authority_type}|${i.authority ?? ""}|${i.program}|${i.program_url}|${[...i.items].sort().join(",")}|${i.amount.type}|${i.amount.number}`;
  let h = 0;
  for (const ch of base) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

export function normalizeRaIncentive(
  i: RaIncentive,
  res: RaResponse,
  loc: LocationQuery,
  retrievedAt: string,
  screened: boolean,
): NormalizedProgram | null {
  const programUrl = safeHttpsUrl(i.program_url) ?? safeHttpsUrl(i.more_info_url);
  if (!programUrl || !i.program) return null;
  const categories = [...new Set(i.items.map((it) => ITEM_CATEGORY[it]).filter(Boolean))] as Category[];
  if (!categories.length) return null;
  const providerType = AUTHORITY_PROVIDER[i.authority_type] ?? "other";
  const authorityName = (i.authority && res.authorities?.[i.authority]?.name) || i.authority || i.authority_type;
  const sourceUrl = "https://www.rewiringamerica.org/app/ira-calculator";
  const amount = amountOf(i, sourceUrl, retrievedAt);
  const coverage =
    providerType === "federal"
      ? { type: "national" as const, states: [], counties: [], zips: [], utilityNames: [], confidence: "source_stated" as const }
      : providerType === "state"
        ? { type: "state" as const, states: [loc.state], counties: [], zips: [], utilityNames: [], confidence: "source_stated" as const, note: "Rewiring America lists this as a state-level program for the searched ZIP." }
        : providerType === "utility"
          ? { type: "utility" as const, states: [loc.state], counties: [], zips: [], utilityNames: [authorityName], confidence: "source_stated" as const, note: `Returned by Rewiring America for ZIP ${loc.zip} as a ${authorityName} program. Availability depends on being a customer of this utility.` }
          : { type: "other" as const, states: [loc.state], counties: [], zips: [], utilityNames: [], confidence: "source_stated" as const, note: `Returned by Rewiring America for ZIP ${loc.zip} (${i.authority_type}-level). The exact eligible area was not verified.` };
  const ended = i.end_date ? new Date(i.end_date) < new Date(retrievedAt) : false;
  const ownership = i.owner_status.includes("homeowner") && i.owner_status.includes("renter") ? "either" : i.owner_status.includes("renter") ? "renter" : "homeowner";
  const benefitTypes = [...new Set(i.payment_methods.map((p) => PAYMENT_BENEFIT[p] ?? "other"))] as BenefitType[];
  const record = normalizedProgramSchema.parse({
    id: `rewiring_america:${stableRaId(i)}`,
    sourceId: "rewiring_america",
    externalId: stableRaId(i),
    name: cleanText(i.program, 300),
    providerName: cleanText(authorityName, 200),
    providerType,
    categories,
    benefitTypes,
    summary: cleanText(i.short_description, 500) || `${cleanText(i.program, 200)} for ${i.items.map((x) => x.replace(/_/g, " ")).join(", ")}.`,
    amounts: [amount],
    stackingNote: "Rewiring America does not state stacking rules for this program.",
    coverage,
    eligibility: {
      summary: [`Owner status: ${ownership === "either" ? "homeowner or renter" : ownership}`],
      ownership,
      applicant: ["residential"],
      income: screened
        ? { type: "source_screened", basis: "Rewiring America screened this program against the household income and size you entered." }
        : { type: "text_only", basis: "Some programs are income-based. Enter household income and size to have Rewiring America screen them." },
      restrictions: i.paused ? ["The source marks this program as paused."] : [],
    },
    application: {
      steps: ["Open the official program page.", "Check current availability and the application instructions on that page."],
      documents: [],
    },
    programUrl,
    applicationUrl: safeHttpsUrl(i.more_info_url),
    startDate: i.start_date,
    endDate: i.end_date,
    status: i.paused ? "exhausted" : ended ? "closed" : "active",
    statusBasis: i.paused
      ? "Rewiring America marks this program as paused (funding or intake not currently open)."
      : ended
        ? `Rewiring America lists an end date of ${i.end_date}.`
        : "Returned by Rewiring America as a current incentive for this location.",
    sourceUrl,
    retrievedAt,
    lastVerifiedAt: retrievedAt,
    verificationMethod: "Live query to the Rewiring America Incentives API; Rewiring America maintains the underlying program data.",
    uncertainties: screened ? [] : ["Income-based programs were screened with placeholder household values, so eligibility is unconfirmed."],
    evidence: { listing: { quote: cleanText(i.short_description ?? i.program, 400), url: sourceUrl, retrievedAt } },
  });
  return record;
}

export const rewiringAmericaAdapter: OnDemandAdapter = {
  meta: RA_META,
  async query(ctx: AdapterContext, loc: LocationQuery, sensitive: SensitiveInputs): Promise<OnDemandResult> {
    const key = ctx.env.REWIRING_AMERICA_API_KEY!;
    const screened = sensitive.householdIncome != null && sensitive.householdSize != null;
    const qs = new URLSearchParams({
      zip: loc.zip,
      owner_status: sensitive.ownerStatus ?? "homeowner",
      // Placeholder when the user leaves income blank: a high income makes income-limited programs
      // appear ineligible rather than silently "eligible". Results are labeled as unscreened.
      household_income: String(sensitive.householdIncome ?? 1_000_000),
      household_size: String(sensitive.householdSize ?? 2),
      include_beta_states: "true",
    });
    for (const it of RA_ITEMS) qs.append("items", it);
    if (sensitive.taxFiling) qs.set("tax_filing", sensitive.taxFiling);
    const retrievedAt = ctx.now().toISOString();
    const res = await safeFetchJson<RaResponse>(`${API}?${qs}`, { allowedHosts: RA_META.allowedHosts, headers: { Authorization: `Bearer ${key}` } }, ctx.fetchImpl);
    const warnings: string[] = [];
    if (!res.coverage?.state) warnings.push(`Rewiring America does not yet cover state-level programs in ${stateByAbbr(loc.state)?.name ?? loc.state}.`);
    if (!res.coverage?.utility) warnings.push("Rewiring America does not yet cover utility programs for this ZIP code.");
    const programs = (res.incentives ?? [])
      .map((i) => normalizeRaIncentive(i, res, loc, retrievedAt, screened))
      .filter((p): p is NormalizedProgram => !!p);
    return { programs, warnings, utilities: res.coverage?.utility ? [res.coverage.utility] : [], persist: false };
  },
};
