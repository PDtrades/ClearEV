import { z } from "zod";
import { BENEFIT_TYPES, CATEGORIES, STATUSES } from "../domain/program";
import { normalizeZip } from "../geo/zip-format";
import { stateByAbbr } from "../geo/states";

/**
 * Shareable search state lives in the URL. Sensitive inputs (income, household size, vehicle
 * details, owner status) never go into the URL; they travel in the request body only and are not
 * persisted. The split is enforced by two separate schemas.
 */
export const shareableSchema = z.object({
  zip: z.string().optional().transform((v) => normalizeZip(v) ?? undefined),
  state: z.string().optional().transform((v) => (v && stateByAbbr(v)?.supported ? v.toUpperCase() : undefined)),
  q: z.string().trim().max(100).optional().transform((v) => v || undefined),
  cat: z.array(z.enum(CATEGORIES)).default([]),
  benefit: z.array(z.enum(BENEFIT_TYPES)).default([]),
  status: z.array(z.enum(STATUSES)).default([]),
  utility: z.string().trim().max(120).optional().transform((v) => v || undefined),
  applicant: z.enum(["residential", "business"]).optional(),
  deadlineBefore: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  view: z.enum(["map", "list"]).optional(),
  sel: z.string().max(120).optional(),
});
export type ShareableParams = z.infer<typeof shareableSchema>;

export const sensitiveSchema = z.object({
  householdIncome: z.number().int().min(0).max(100_000_000).optional(),
  householdSize: z.number().int().min(1).max(8).optional(),
  taxFiling: z.enum(["single", "joint", "hoh"]).optional(),
  ownerStatus: z.enum(["homeowner", "renter"]).optional(),
  vehicle: z
    .object({
      make: z.string().trim().max(40).optional(),
      model: z.string().trim().max(60).optional(),
      year: z.number().int().min(1990).max(2035).optional(),
      condition: z.enum(["new", "used"]).optional(),
      acquisition: z.enum(["purchase", "lease"]).optional(),
      price: z.number().int().min(0).max(1_000_000).optional(),
    })
    .optional(),
});
export type SensitiveParams = z.infer<typeof sensitiveSchema>;

export const SENSITIVE_KEYS = ["householdIncome", "householdSize", "taxFiling", "ownerStatus", "vehicle", "income", "make", "model", "price"] as const;

export function parseShareable(sp: URLSearchParams | Record<string, string | string[] | undefined>): ShareableParams {
  const get = (k: string): string | string[] | undefined => (sp instanceof URLSearchParams ? (sp.getAll(k).length > 1 ? sp.getAll(k) : (sp.get(k) ?? undefined)) : sp[k]);
  const list = (k: string) => {
    const v = get(k);
    const arr = Array.isArray(v) ? v : v ? v.split(",") : [];
    return arr.map((s) => s.trim()).filter(Boolean);
  };
  const str = (k: string) => {
    const v = get(k);
    return Array.isArray(v) ? v[0] : v;
  };
  const enumList = (k: string, allowed: readonly string[]) => list(k).filter((v) => allowed.includes(v));
  const dl = str("deadlineBefore");
  return shareableSchema.parse({
    zip: str("zip"),
    state: str("state"),
    q: str("q"),
    cat: enumList("cat", CATEGORIES),
    benefit: enumList("benefit", BENEFIT_TYPES),
    status: enumList("status", STATUSES),
    utility: str("utility"),
    applicant: ["residential", "business"].includes(str("applicant") ?? "") ? str("applicant") : undefined,
    deadlineBefore: dl && /^\d{4}-\d{2}-\d{2}$/.test(dl) ? dl : undefined,
    view: ["map", "list"].includes(str("view") ?? "") ? str("view") : undefined,
    sel: str("sel"),
  });
}

/** Serializes shareable state; sensitive keys are structurally impossible to include. */
export function toSearchString(p: Partial<ShareableParams>): string {
  const sp = new URLSearchParams();
  if (p.zip) sp.set("zip", p.zip);
  if (p.state) sp.set("state", p.state);
  if (p.q) sp.set("q", p.q);
  if (p.cat?.length) sp.set("cat", p.cat.join(","));
  if (p.benefit?.length) sp.set("benefit", p.benefit.join(","));
  if (p.status?.length) sp.set("status", p.status.join(","));
  if (p.utility) sp.set("utility", p.utility);
  if (p.applicant) sp.set("applicant", p.applicant);
  if (p.deadlineBefore) sp.set("deadlineBefore", p.deadlineBefore);
  if (p.view) sp.set("view", p.view);
  if (p.sel) sp.set("sel", p.sel);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Strips sensitive values from anything about to be logged. */
export function redactForLog(obj: unknown): unknown {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redactForLog);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = (SENSITIVE_KEYS as readonly string[]).includes(k) ? "[redacted]" : redactForLog(v);
  }
  return out;
}
