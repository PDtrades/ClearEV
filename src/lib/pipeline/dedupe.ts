import { and, eq, ne, sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { programs } from "../db/schema";
import type { NormalizedProgram } from "../domain/program";

/**
 * Duplicate detection is deliberately conservative: two records are only called possible duplicates
 * when they share the same official program URL, or the same provider plus a near-identical name,
 * AND their stated benefits do not materially differ. Materially different offers (different amount,
 * different benefit type, different category set) are never merged, only cross-referenced.
 */
export interface DuplicateHint {
  programId: string;
  duplicateOf: string;
  score: number;
  why: string;
}

export const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(program|rebate|incentive|credit|the|a|an|for|of|and)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const canonicalUrl = (u: string) => {
  try {
    const url = new URL(u);
    url.hash = "";
    url.search = "";
    return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return u;
  }
};

export function materiallyDifferent(a: Pick<NormalizedProgram, "amounts" | "benefitTypes" | "categories">, b: Pick<NormalizedProgram, "amounts" | "benefitTypes" | "categories">): string | null {
  const amt = (x: typeof a) => x.amounts.filter((m) => m.kind !== "text").map((m) => `${m.kind}:${m.value}:${m.maximum ?? ""}`).sort().join("|");
  if (amt(a) && amt(b) && amt(a) !== amt(b)) return "different stated amounts";
  const bt = (x: typeof a) => [...x.benefitTypes].sort().join(",");
  if (bt(a) !== bt(b) && !(a.benefitTypes.includes("rebate_timing_unknown") || b.benefitTypes.includes("rebate_timing_unknown"))) return "different benefit types";
  if (!a.categories.some((c) => b.categories.includes(c))) return "no shared category";
  return null;
}

export function scorePair(a: NormalizedProgram, b: Pick<NormalizedProgram, "id" | "name" | "providerName" | "programUrl" | "amounts" | "benefitTypes" | "categories" | "coverage">): DuplicateHint | null {
  if (a.id === b.id) return null;
  const diff = materiallyDifferent(a, b);
  if (diff) return null;
  const sameUrl = canonicalUrl(a.programUrl) === canonicalUrl(b.programUrl) && !/afdc\.energy\.gov\/laws\/\d+$/.test(a.programUrl);
  const sameName = normalizeName(a.name) === normalizeName(b.name) && normalizeName(a.name).length > 6;
  const sameProvider = normalizeName(a.providerName) === normalizeName(b.providerName);
  const sameStates = JSON.stringify([...a.coverage.states].sort()) === JSON.stringify([...b.coverage.states].sort());
  if (sameUrl && sameStates) return { programId: a.id, duplicateOf: b.id, score: 0.95, why: "same official program URL" };
  if (sameName && sameProvider && sameStates) return { programId: a.id, duplicateOf: b.id, score: 0.85, why: "same provider and name" };
  return null;
}

export async function findDuplicates(db: DB, records: NormalizedProgram[]): Promise<DuplicateHint[]> {
  const hints: DuplicateHint[] = [];
  for (const r of records) {
    const candidates = await db
      .select({ id: programs.id, name: programs.name, providerName: programs.providerName, programUrl: programs.programUrl, amounts: programs.amounts, benefitTypes: programs.benefitTypes, categories: programs.categories, coverage: programs.coverage })
      .from(programs)
      .where(and(ne(programs.sourceId, r.sourceId), sql`(${programs.programUrl} = ${r.programUrl} OR lower(${programs.providerName}) = lower(${r.providerName}))`))
      .limit(50);
    for (const c of candidates) {
      const h = scorePair(r, c as never);
      if (h) hints.push(h);
    }
  }
  return hints;
}

/** Pure in-memory version used for on-demand results merged with stored ones. */
export function collapseDuplicates<T extends NormalizedProgram>(list: T[], priority: (sourceId: string) => number): { kept: T[]; collapsed: Map<string, string[]> } {
  const sorted = [...list].sort((a, b) => priority(a.sourceId) - priority(b.sourceId));
  const kept: T[] = [];
  const collapsed = new Map<string, string[]>();
  for (const p of sorted) {
    const dup = kept.find((k) => scorePair(p, k));
    if (dup) collapsed.set(dup.id, [...(collapsed.get(dup.id) ?? []), p.id]);
    else kept.push(p);
  }
  return { kept, collapsed };
}
