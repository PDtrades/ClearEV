import { safeFetchJson } from "../security/http";
import { cleanText, safeHttpsUrl, sanitizeSourceHtml, splitSentences } from "../security/sanitize";
import { SUPPORTED_STATES, stateByAbbr } from "../geo/states";
import type { Amount, BenefitType, Category, NormalizedProgramInput, ProviderType } from "../domain/program";
import type { AdapterContext, BulkAdapter, BulkResult, SourceMeta } from "./types";

/**
 * U.S. DOE Alternative Fuels Data Center (AFDC) — Federal and State Laws and Incentives, via the
 * NREL developer API (api.data.gov key). Covers federal, state, and utility/private incentives for
 * electric vehicles and charging. AFDC content is published by DOE/NREL; we attribute AFDC and link
 * each record back to its AFDC page.
 */
export const AFDC_META: SourceMeta = {
  id: "afdc",
  name: "U.S. DOE Alternative Fuels Data Center — Laws and Incentives",
  kind: "bulk",
  homepage: "https://afdc.energy.gov/laws",
  termsUrl: "https://developer.nrel.gov/docs/api-key/",
  attribution: "Source: U.S. Department of Energy, Alternative Fuels Data Center (afdc.energy.gov)",
  requiredEnv: ["NREL_API_KEY"],
  allowedHosts: ["developer.nrel.gov"],
  covers:
    "Federal and state incentives plus utility/private incentives for all-electric and plug-in hybrid vehicles and charging equipment, for all 50 states and DC.",
  gaps:
    "No solar or home-battery programs. Utility/private incentives are listed by state without service-territory boundaries. Benefit amounts are in free text, not structured.",
  priority: 20,
  staleAfterDays: 14,
};

const API = "https://developer.nrel.gov/api/transportation-incentives-laws/v1.json";

interface AfdcCode {
  code?: string;
  title?: string;
  category_type?: string;
}
export interface AfdcLaw {
  id: number;
  state: string;
  title: string;
  text: string;
  plaintext?: string;
  type?: string;
  agency?: string | null;
  categories?: AfdcCode[];
  types?: AfdcCode[];
  references?: { url?: string; description?: string }[];
  enacted_date?: string | null;
  amended_date?: string | null;
  expired_date?: string | null;
  archived_date?: string | null;
  repealed_date?: string | null;
  significant_update_date?: string | null;
}

const INCENTIVE_BENEFIT: Record<string, BenefitType> = {
  GNT: "grant",
  TAX: "tax_credit",
  LOANS: "financing",
  RBATE: "rebate_timing_unknown",
  EXEM: "exemption",
  TOU: "rate_plan",
  OTHER: "other",
};
const USER_TYPE: Record<string, "residential" | "business" | "government"> = {
  IND: "residential",
  MUD: "business",
  FLEET: "business",
  STATION: "business",
  AFP: "business",
  MAN: "business",
  PURCH: "business",
  GOV: "government",
  TRIBAL: "government",
  TRANS: "government",
};

export const afdcLawUrl = (id: number) => `https://afdc.energy.gov/laws/${id}`;

function codesOf(law: AfdcLaw): string[] {
  return [...(law.categories ?? []), ...(law.types ?? [])].map((c) => (c.code ?? "").trim().toUpperCase()).filter(Boolean);
}

export function markdownToText(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_#>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const RX = {
  charger: /\b(charging station|charger|chargers|EVSE|electric vehicle supply equipment|charging infrastructure|charging equipment|charging port)\b/i,
  home: /\b(residential|home|homeowner|single-family|level 2 charger for (?:your|their) home)\b/i,
  publicCharging: /\b(public|DC fast|DCFC|workplace|multi-unit|multifamily|commercial)\b/i,
  vehicle: /\b(vehicle|vehicles|EV|EVs|PEV|PEVs|car|cars|truck|trucks|bus|buses|motorcycle)\b/i,
  purchase: /\b(purchase|lease|acquisition|acquire|buy)\b/i,
  rate: /\b(time-of-use|TOU|rate plan|electricity rate|discounted rate|special rate)\b/i,
  solar: /\bsolar\b/i,
  battery: /\b(battery storage|energy storage|home battery|stationary storage)\b/i,
  utility: /\b(utility|utilities|electric|power|energy|cooperative|co-op|PUD|municipal|light|gas & electric|edison)\b/i,
};

export function classifyAfdc(law: AfdcLaw, text: string): Category[] {
  const t = `${law.title} ${text}`;
  const codes = codesOf(law);
  const cats = new Set<Category>();
  if (RX.charger.test(t)) {
    if (RX.home.test(t)) cats.add("home_charging");
    if (RX.publicCharging.test(t) || !RX.home.test(t)) cats.add("public_charging");
  }
  if (RX.vehicle.test(law.title) && RX.purchase.test(t) && !/^\s*(EVSE|charging)/i.test(law.title)) cats.add("ev_purchase");
  if (!cats.has("ev_purchase") && !RX.charger.test(law.title) && RX.vehicle.test(law.title)) cats.add("ev_purchase");
  if (codes.includes("TOU") || RX.rate.test(t)) cats.add("utility_rate");
  if (RX.solar.test(t)) cats.add("solar");
  if (RX.battery.test(t)) cats.add("battery");
  if (cats.size === 0) cats.add("other");
  return [...cats];
}

function providerFor(law: AfdcLaw, text: string, isUtilityPrivate: boolean): { name: string; type: ProviderType; uncertain?: string } {
  if (law.state === "US") return { name: law.agency?.trim() || "U.S. federal government", type: "federal" };
  const st = stateByAbbr(law.state);
  if (!isUtilityPrivate) {
    return law.agency?.trim()
      ? { name: law.agency.trim(), type: "state" }
      : { name: `State of ${st?.name ?? law.state}`, type: "state", uncertain: "The administering state agency is named in the program description." };
  }
  const suffix = law.title.match(/\s[-–—]\s([^-–—]{3,80})$/)?.[1]?.trim();
  const lead = text.match(/^([A-Z][A-Za-z0-9&.,'() -]{2,80}?)\s+(offers|provides|customers|offer|has|may|will)\b/)?.[1]?.trim();
  const name = suffix ?? lead;
  if (!name) return { name: "Utility or private organization (named in description)", type: "other", uncertain: "Provider name could not be extracted automatically." };
  return RX.utility.test(name)
    ? { name, type: "utility" }
    : { name, type: "other", uncertain: "Provider type (utility, nonprofit, or company) not stated in structured data." };
}

export function amountsFromText(text: string, url: string, retrievedAt: string): Amount[] {
  return splitSentences(text)
    .filter((s) => /\$\s?\d|\d+\s?%|\bpercent\b/i.test(s))
    .slice(0, 3)
    .map((s) => {
      const quote = s.length > 400 ? `${s.slice(0, 399)}…` : s;
      return { kind: "text" as const, label: quote, evidence: { quote, url, retrievedAt } };
    });
}

function pickProgramUrl(law: AfdcLaw): string | undefined {
  const statute = /(code|statute|stat\.|bill|act\b|session law|rev\.|§|section|regulation|rule|C\.F\.R|U\.S\.C|public law)/i;
  for (const r of law.references ?? []) {
    const u = safeHttpsUrl(r.url);
    if (u && !statute.test(r.description ?? "")) return u;
  }
  return undefined;
}

export function normalizeAfdcLaw(law: AfdcLaw, retrievedAt: string, now: Date): NormalizedProgramInput | { reject: string } {
  if (!law?.id || !law.title || !law.state) return { reject: "missing id, title, or jurisdiction" };
  if (law.state !== "US" && !stateByAbbr(law.state)?.supported) return { reject: `unsupported jurisdiction ${law.state}` };
  const typeText = `${law.type ?? ""} ${codesOf(law).join(" ")}`;
  if (law.type && !/incentive/i.test(law.type)) return { reject: `not an incentive (${law.type})` };
  const isUtilityPrivate = /utility|private|UPINC/i.test(typeText);
  const text = law.plaintext ? markdownToText(law.plaintext) : cleanText(law.text, 20_000);
  if (!text) return { reject: "empty description" };

  const codes = codesOf(law);
  const lawUrl = afdcLawUrl(law.id);
  const benefitTypes = [...new Set(codes.map((c) => INCENTIVE_BENEFIT[c]).filter(Boolean))] as BenefitType[];
  const applicant = [...new Set(codes.map((c) => USER_TYPE[c]).filter(Boolean))];
  const provider = providerFor(law, text, isUtilityPrivate);
  const st = stateByAbbr(law.state);
  const uncertainties = [
    "Categories were assigned automatically from the source text.",
    "Benefit amounts are quoted from the source text and were not independently verified.",
  ];
  if (provider.uncertain) uncertainties.push(provider.uncertain);
  if (!benefitTypes.length) uncertainties.push("Benefit type is not structured in the source.");

  const coverage =
    law.state === "US"
      ? { type: "national" as const, states: [], confidence: "source_stated" as const, note: "Federal program listed by AFDC." }
      : isUtilityPrivate
        ? {
            type: "utility" as const,
            states: [law.state],
            utilityNames: provider.type === "utility" ? [provider.name] : [],
            confidence: "unverified" as const,
            note: `Listed by AFDC under ${st?.name}. Available only to customers or areas served by ${provider.name}; the eligible service area was not verified and may not cover the whole state.`,
          }
        : {
            type: "state" as const,
            states: [law.state],
            confidence: "source_stated" as const,
            note: `Listed by AFDC as a ${st?.name} state incentive. Some state programs are limited to specific regions; check the details.`,
          };

  const endDate = law.expired_date ?? law.repealed_date ?? undefined;
  const ended = endDate ? new Date(endDate) < now : false;
  const programUrl = pickProgramUrl(law);
  if (!programUrl) uncertainties.push("The source lists no separate official program page; links go to the AFDC summary.");

  return {
    id: `afdc:${law.id}`,
    sourceId: "afdc",
    externalId: String(law.id),
    name: cleanText(law.title, 300),
    providerName: provider.name,
    providerType: provider.type,
    categories: classifyAfdc(law, text),
    benefitTypes: benefitTypes.length ? benefitTypes : ["other"],
    summary: cleanText(splitSentences(text).slice(0, 2).join(" "), 500),
    descriptionHtml: sanitizeSourceHtml(law.text ?? ""),
    amounts: amountsFromText(text, lawUrl, retrievedAt),
    stackingNote: "Whether this can be combined with other programs is not stated in structured data.",
    coverage,
    eligibility: {
      summary: [],
      applicant: applicant.length ? (applicant as ("residential" | "business" | "government")[]) : undefined,
      utilityCustomersOf: coverage.type === "utility" && provider.type === "utility" ? [provider.name] : undefined,
      income: /\bincome\b/i.test(text)
        ? { type: "text_only", basis: "The source mentions income criteria in its description; they are not available as structured rules." }
        : undefined,
      restrictions: [],
    },
    application: {
      steps: [
        "Read the full program description and confirm the current terms on the official page.",
        `Contact ${provider.name} or follow the official page's instructions to apply.`,
      ],
      documents: [],
    },
    programUrl: programUrl ?? lawUrl,
    startDate: law.enacted_date ?? undefined,
    endDate,
    status: ended ? "closed" : "active",
    statusBasis: ended
      ? `The source lists an end date of ${endDate?.slice(0, 10)}.`
      : "Listed by AFDC as a current incentive (not expired or archived) when retrieved. Funding availability was not confirmed.",
    sourceUrl: lawUrl,
    retrievedAt,
    lastVerifiedAt: law.significant_update_date ?? law.amended_date ?? undefined,
    verificationMethod: "Retrieved from the AFDC Laws and Incentives API; AFDC staff maintain the listing. Not independently confirmed with the administrator.",
    uncertainties,
    evidence: {
      listing: { quote: cleanText(law.title, 300), url: lawUrl, retrievedAt },
    },
  };
}

export const afdcAdapter: BulkAdapter = {
  meta: AFDC_META,
  async fetchAll(ctx: AdapterContext): Promise<BulkResult> {
    const key = ctx.env.NREL_API_KEY!;
    const result: BulkResult = { records: [], warnings: [], rejected: [] };
    const retrievedAt = ctx.now().toISOString();
    const jurisdictions = ["US", ...SUPPORTED_STATES.map((s) => s.abbr)];
    let failures = 0;
    let consecutive = 0;
    for (const j of jurisdictions) {
      // If the API is down, stop after a few consecutive failures instead of hammering it 52 times.
      if (consecutive >= 3) {
        result.warnings.push(`AFDC ${j}: skipped after ${consecutive} consecutive failures`);
        failures++;
        continue;
      }
      const qs = new URLSearchParams({
        api_key: key,
        jurisdiction: j,
        technology: "ELEC,PHEV",
        law_type: "INC",
        expired: "false",
        limit: "500",
      });
      try {
        const data = await safeFetchJson<{ result?: AfdcLaw[] }>(`${API}?${qs}`, { allowedHosts: AFDC_META.allowedHosts }, ctx.fetchImpl);
        for (const law of data.result ?? []) {
          const n = normalizeAfdcLaw(law, retrievedAt, ctx.now());
          if ("reject" in n) result.rejected.push({ externalId: String(law?.id), reason: n.reject });
          else result.records.push(n);
        }
        consecutive = 0;
      } catch (e) {
        failures++;
        consecutive++;
        result.warnings.push(`AFDC ${j}: ${(e as Error).message}`);
      }
    }
    if (failures === jurisdictions.length) throw new Error(`AFDC unavailable: ${result.warnings[0]}`);
    return result;
  },
};
