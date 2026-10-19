import { z } from "zod";

/** Program categories. Icons are chosen by category (shape + text label, never color alone). */
export const CATEGORIES = [
  "ev_purchase",
  "home_charging",
  "public_charging",
  "solar",
  "battery",
  "utility_rate",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  ev_purchase: "EV purchase or lease",
  home_charging: "Home charging",
  public_charging: "Public charging",
  solar: "Solar",
  battery: "Home battery",
  utility_rate: "Utility rate or benefit",
  other: "Other benefit",
};

/** Map icon families from the brief: bolt (EV + charging), solar, battery, plug/utility, general. */
export type IconKind = "bolt" | "solar" | "battery" | "plug" | "general";
export function iconForCategory(c: Category): IconKind {
  switch (c) {
    case "ev_purchase":
    case "home_charging":
    case "public_charging":
      return "bolt";
    case "solar":
      return "solar";
    case "battery":
      return "battery";
    case "utility_rate":
      return "plug";
    default:
      return "general";
  }
}
export const ICON_LABELS: Record<IconKind, string> = {
  bolt: "EV & charging",
  solar: "Solar",
  battery: "Home battery",
  plug: "Utility rates & benefits",
  general: "Other benefits",
};

/** Benefit types are intentionally distinct: they are never interchangeable. */
export const BENEFIT_TYPES = [
  "tax_credit",
  "pos_rebate",
  "post_purchase_rebate",
  "rebate_timing_unknown",
  "grant",
  "financing",
  "rate_plan",
  "bill_credit",
  "exemption",
  "assistance",
  "commercial_discount",
  "other",
] as const;
export type BenefitType = (typeof BENEFIT_TYPES)[number];
export const BENEFIT_LABELS: Record<BenefitType, string> = {
  tax_credit: "Tax credit (claimed when you file taxes)",
  pos_rebate: "Point-of-sale discount (applied at purchase)",
  post_purchase_rebate: "Rebate paid after purchase",
  rebate_timing_unknown: "Rebate (payment timing not stated)",
  grant: "Grant",
  financing: "Financing or loan",
  rate_plan: "Special electricity rate plan",
  bill_credit: "Utility bill credit",
  exemption: "Fee or tax exemption",
  assistance: "Assistance program",
  commercial_discount: "Commercial offer or discount",
  other: "Other benefit",
};
export const BENEFIT_SHORT: Record<BenefitType, string> = {
  tax_credit: "Tax credit",
  pos_rebate: "Point-of-sale discount",
  post_purchase_rebate: "Rebate after purchase",
  rebate_timing_unknown: "Rebate",
  grant: "Grant",
  financing: "Financing",
  rate_plan: "Rate plan",
  bill_credit: "Bill credit",
  exemption: "Exemption",
  assistance: "Assistance",
  commercial_discount: "Commercial offer",
  other: "Other",
};

export const PROVIDER_TYPES = ["federal", "state", "local", "utility", "nonprofit", "company", "other"] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];
/** Public incentives vs commercial promotions must stay visually distinguishable. */
export const isCommercialProvider = (t: ProviderType) => t === "company";

export const STATUSES = ["active", "upcoming", "closed", "exhausted", "unknown"] as const;
export type ProgramStatus = (typeof STATUSES)[number];

const evidence = z.object({
  quote: z.string().min(1),
  url: z.string().url(),
  retrievedAt: z.string(),
});
export type Evidence = z.infer<typeof evidence>;

export const amountSchema = z.object({
  kind: z.enum(["flat", "percent", "per_unit", "text"]),
  /** Dollar value (flat), percentage (percent), or dollars per unit. Omitted for kind=text. */
  value: z.number().nonnegative().optional(),
  maximum: z.number().nonnegative().optional(),
  unit: z.string().optional(),
  /** Human-readable statement, always shown with the evidence that supports it. */
  label: z.string(),
  evidence: evidence.optional(),
});
export type Amount = z.infer<typeof amountSchema>;

export const coverageSchema = z.object({
  type: z.enum(["national", "state", "county", "municipality", "zip", "utility", "other", "unknown"]),
  states: z.array(z.string().length(2)).default([]),
  counties: z.array(z.string()).default([]),
  zips: z.array(z.string().regex(/^\d{5}$/)).default([]),
  utilityNames: z.array(z.string()).default([]),
  /** verified = boundary checked; source_stated = per source listing; unverified = boundary not confirmed. */
  confidence: z.enum(["verified", "source_stated", "unverified"]),
  note: z.string().optional(),
});
export type Coverage = z.infer<typeof coverageSchema>;

const incomeRule = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("magi_by_filing_status"),
    limits: z.object({ joint: z.number(), head_of_household: z.number(), other: z.number() }),
    basis: z.string(),
    evidence: evidence.optional(),
  }),
  z.object({
    type: z.literal("max_by_household_size"),
    /** index 0 = household of 1 */
    limits: z.array(z.number()).min(1),
    basis: z.string(),
    evidence: evidence.optional(),
  }),
  z.object({
    type: z.literal("source_screened"),
    basis: z.string(),
  }),
  z.object({ type: z.literal("text_only"), basis: z.string(), evidence: evidence.optional() }),
]);
export type IncomeRule = z.infer<typeof incomeRule>;

export const eligibilitySchema = z.object({
  summary: z.array(z.string()).default([]),
  income: incomeRule.optional(),
  ownership: z.enum(["homeowner", "renter", "either"]).optional(),
  applicant: z.array(z.enum(["residential", "business", "government", "nonprofit"])).optional(),
  vehicle: z
    .object({
      condition: z.array(z.enum(["new", "used"])).optional(),
      acquisition: z.array(z.enum(["purchase", "lease"])).optional(),
      maxPrice: z.number().optional(),
      maxPriceNote: z.string().optional(),
      /** Exact make/model/year combinations verified by the source. Never inferred for a whole brand. */
      qualifyingModels: z.array(z.object({ make: z.string(), model: z.string(), years: z.array(z.number()) })).optional(),
      evidence: evidence.optional(),
    })
    .optional(),
  utilityCustomersOf: z.array(z.string()).optional(),
  restrictions: z.array(z.string()).default([]),
});
export type Eligibility = z.infer<typeof eligibilitySchema>;

export const applicationSchema = z.object({
  steps: z.array(z.string()).default([]),
  documents: z.array(z.string()).default([]),
  deadlineNote: z.string().optional(),
});

export const normalizedProgramSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+:[A-Za-z0-9_.:-]+$/),
  sourceId: z.string(),
  externalId: z.string(),
  name: z.string().min(2).max(300),
  providerName: z.string().min(1),
  providerType: z.enum(PROVIDER_TYPES),
  categories: z.array(z.enum(CATEGORIES)).min(1),
  benefitTypes: z.array(z.enum(BENEFIT_TYPES)).min(1),
  summary: z.string().min(1).max(600),
  descriptionHtml: z.string().optional(),
  amounts: z.array(amountSchema).default([]),
  stackingNote: z.string().optional(),
  coverage: coverageSchema,
  providerLocation: z.string().optional(),
  eligibility: eligibilitySchema,
  application: applicationSchema,
  programUrl: z.string().url(),
  applicationUrl: z.string().url().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(STATUSES),
  statusBasis: z.string(),
  fundingNote: z.string().optional(),
  sourceUrl: z.string().url(),
  retrievedAt: z.string(),
  lastVerifiedAt: z.string().optional(),
  verificationMethod: z.string(),
  uncertainties: z.array(z.string()).default([]),
  evidence: z.record(z.string(), evidence).default({}),
  isFixture: z.boolean().default(false),
});
export type NormalizedProgram = z.infer<typeof normalizedProgramSchema>;
export type NormalizedProgramInput = z.input<typeof normalizedProgramSchema>;

/** A program as served to the browser (DB row joined with review state and freshness flags). */
export type ProgramView = NormalizedProgram & {
  reviewState: "published" | "needs_review" | "rejected";
  sourceName: string;
  sourceAttribution?: string;
  stale: boolean;
  sourceUnavailableSince?: string;
  linkStatus?: "ok" | "broken" | "unchecked";
};
