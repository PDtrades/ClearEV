import type { Amount, ProgramView } from "../domain/program";

/**
 * Map hotspots: the states and counties with the most open programs, or with the largest single
 * dollar figure a source states. Rules that keep this honest:
 * - Nationwide programs are left out (they apply everywhere, so they cannot make one place a hotspot).
 * - Closed and exhausted programs are left out; "unknown" status counts but is labelled as such.
 * - "Largest amount" is the largest single dollar figure one program states (a flat amount, or the
 *   stated cap of a percentage or per-unit amount). Amounts from different programs are never added.
 */
export type HotspotMode = "programs" | "amount";

export interface HotspotTop {
  value: number;
  label: string;
  programId: string;
  programName: string;
}
export interface Hotspot {
  /** State abbreviation, or 5-digit county FIPS. */
  key: string;
  level: "state" | "county";
  state: string;
  /** County name (counties only), from the Census county list. */
  name?: string;
  programs: number;
  programIds: string[];
  top?: HotspotTop;
}
export interface HotspotData {
  states: Hotspot[];
  counties: Hotspot[];
  /** Programs that were counted (not national, not closed). */
  counted: number;
}

const COUNTED_STATUSES = new Set(["active", "upcoming", "unknown"]);

/** The dollar figure an amount states, if any. Percentages count only through their stated cap. */
export function statedDollars(a: Amount): number | undefined {
  if (a.kind === "flat") return a.value;
  if (a.kind === "percent" || a.kind === "per_unit") return a.maximum;
  return undefined;
}

export function largestStatedAmount(p: Pick<ProgramView, "id" | "name" | "amounts">): HotspotTop | undefined {
  let best: HotspotTop | undefined;
  for (const a of p.amounts) {
    const v = statedDollars(a);
    if (v != null && v > 0 && (!best || v > best.value)) best = { value: v, label: a.label, programId: p.id, programName: p.name };
  }
  return best;
}

type HotspotInput = Pick<ProgramView, "id" | "name" | "amounts" | "coverage" | "status" | "reviewState">;

export function computeHotspots(programs: HotspotInput[]): HotspotData {
  const states = new Map<string, Hotspot>();
  const counties = new Map<string, Hotspot>();
  let counted = 0;
  const add = (map: Map<string, Hotspot>, key: string, level: Hotspot["level"], state: string, p: HotspotInput, top: HotspotTop | undefined) => {
    const h = map.get(key) ?? { key, level, state, programs: 0, programIds: [] };
    if (h.programIds.includes(p.id)) return;
    h.programs++;
    h.programIds.push(p.id);
    if (top && (!h.top || top.value > h.top.value)) h.top = top;
    map.set(key, h);
  };
  for (const p of programs) {
    if (p.reviewState !== "published" || !COUNTED_STATUSES.has(p.status)) continue;
    if (p.coverage.type === "national" || p.coverage.type === "unknown") continue;
    if (!p.coverage.states.length) continue;
    counted++;
    const top = largestStatedAmount(p);
    for (const s of p.coverage.states) add(states, s, "state", s, p, top);
    // County, city and utility programs count toward a county only when the source names it.
    for (const fips of p.coverage.counties ?? []) {
      if (!/^\d{5}$/.test(fips)) continue;
      add(counties, fips, "county", p.coverage.states[0], p, top);
    }
  }
  return { states: [...states.values()], counties: [...counties.values()], counted };
}

export function metric(h: Hotspot, mode: HotspotMode): number {
  return mode === "programs" ? h.programs : (h.top?.value ?? 0);
}

/** Areas ranked by the chosen measure; areas scoring zero are not hotspots. */
export function rankHotspots(list: Hotspot[], mode: HotspotMode, limit = 5): Hotspot[] {
  return list
    .filter((h) => metric(h, mode) > 0)
    .sort((a, b) => metric(b, mode) - metric(a, mode) || b.programs - a.programs || (b.top?.value ?? 0) - (a.top?.value ?? 0) || a.key.localeCompare(b.key))
    .slice(0, limit);
}

export function fmtDollars(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export interface CountyGroup {
  /** Counties sharing exactly the same programs (e.g. every county one air district serves). */
  counties: Hotspot[];
  state: string;
  programs: number;
  top?: HotspotTop;
}

/** County hotspots, with counties that share the same programs merged into one entry. */
export function rankCountyGroups(list: Hotspot[], mode: HotspotMode, limit = 3): CountyGroup[] {
  const groups = new Map<string, CountyGroup>();
  for (const h of list) {
    if (metric(h, mode) <= 0) continue;
    const key = `${h.state}|${[...h.programIds].sort().join(",")}`;
    const g = groups.get(key) ?? { counties: [], state: h.state, programs: h.programs, top: h.top };
    g.counties.push(h);
    groups.set(key, g);
  }
  const m = (g: CountyGroup) => (mode === "programs" ? g.programs : (g.top?.value ?? 0));
  return [...groups.values()]
    .map((g) => ({ ...g, counties: g.counties.sort((a, b) => (a.name ?? a.key).localeCompare(b.name ?? b.key)) }))
    .sort((a, b) => m(b) - m(a) || b.counties.length - a.counties.length)
    .slice(0, limit);
}
