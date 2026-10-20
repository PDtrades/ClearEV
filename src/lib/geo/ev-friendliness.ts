import raw from "../../../data/ev-friendliness.json";

/**
 * EV-friendliness per state, from two official measures:
 *  - charger access: public EV charging ports per 100,000 residents (DOE AFDC ports / Census population)
 *  - charging cost: the cost measure in data/ev-friendliness.json (lower is friendlier)
 * Each measure becomes a percentile rank among the states that have it (0 = least friendly,
 * 100 = most friendly); the score is the average of the two. Ranks rather than raw values keep one
 * outlier from flattening everyone else, and the page shows the underlying numbers next to the score.
 */
export interface EvSource {
  name: string;
  url: string;
  measure?: string;
  asOf?: string;
  period?: string;
  retrievedAt?: string;
}
export interface EvInputs {
  sources: { chargers: EvSource; cost: EvSource; population: EvSource } | null;
  states: Record<string, { chargerPorts: number | null; cost: number | null; population: number | null }>;
}
export interface EvFriendlyRow {
  state: string;
  score: number | null;
  chargerPorts: number | null;
  population: number | null;
  portsPer100k: number | null;
  cost: number | null;
  chargerPct: number | null;
  costPct: number | null;
}
export interface EvFriendlyData {
  rows: Record<string, EvFriendlyRow>;
  sources: EvInputs["sources"];
  /** e.g. "average residential electricity price, cents/kWh" */
  costMeasure: string;
  costUnit: "cents_per_kwh" | "dollars_per_egallon" | "other";
}

function percentiles(values: Map<string, number>, higherIsBetter: boolean): Map<string, number> {
  const entries = [...values.entries()].sort((a, b) => (higherIsBetter ? a[1] - b[1] : b[1] - a[1]));
  const n = entries.length;
  const out = new Map<string, number>();
  entries.forEach(([k, v], i) => {
    // Ties share the average position.
    const first = entries.findIndex((e) => e[1] === v);
    let last = first;
    while (last + 1 < n && entries[last + 1][1] === v) last++;
    out.set(k, n > 1 ? Math.round((((first + last) / 2) / (n - 1)) * 100) : 50);
    void i;
  });
  return out;
}

export function computeEvFriendliness(input: EvInputs): EvFriendlyData {
  const density = new Map<string, number>();
  const cost = new Map<string, number>();
  for (const [st, v] of Object.entries(input.states)) {
    if (v.chargerPorts != null && v.population) density.set(st, (v.chargerPorts / v.population) * 100_000);
    if (v.cost != null && v.cost > 0) cost.set(st, v.cost);
  }
  const dPct = percentiles(density, true);
  const cPct = percentiles(cost, false);
  const rows: Record<string, EvFriendlyRow> = {};
  for (const [st, v] of Object.entries(input.states)) {
    const a = dPct.get(st) ?? null;
    const b = cPct.get(st) ?? null;
    rows[st] = {
      state: st,
      score: a != null && b != null ? Math.round((a + b) / 2) : null,
      chargerPorts: v.chargerPorts,
      population: v.population,
      portsPer100k: density.has(st) ? Math.round(density.get(st)! * 10) / 10 : null,
      cost: v.cost,
      chargerPct: a,
      costPct: b,
    };
  }
  const measure = input.sources?.cost.measure ?? "";
  return {
    rows,
    sources: input.sources,
    costMeasure: measure,
    costUnit: /egallon/i.test(measure) ? "dollars_per_egallon" : /cents/i.test(measure) ? "cents_per_kwh" : "other",
  };
}

export function fmtCost(d: Pick<EvFriendlyData, "costUnit">, v: number | null): string {
  if (v == null) return "not available";
  if (d.costUnit === "cents_per_kwh") return `${v.toFixed(1)}¢/kWh`;
  if (d.costUnit === "dollars_per_egallon") return `$${v.toFixed(2)} per eGallon`;
  return String(v);
}

/** Score color stops, red (low) to green (high); the map's score labels, swatch and meters share them. */
export const SCORE_STOPS: [number, string][] = [[0, "#c8553d"], [35, "#e9a23b"], [60, "#8fbf4d"], [100, "#1d8a5a"]];

/** Fill color for a 0-100 score, interpolated between SCORE_STOPS, and a readable text color for it. */
export function scoreColor(score: number): { fill: string; ink: string } {
  const s = Math.max(0, Math.min(100, score));
  let i = 1;
  while (i < SCORE_STOPS.length - 1 && s > SCORE_STOPS[i][0]) i++;
  const [a, ca] = SCORE_STOPS[i - 1];
  const [b, cb] = SCORE_STOPS[i];
  const t = (s - a) / (b - a);
  const rgb = [0, 2, 4].map((k) => Math.round(parseInt(ca.slice(1 + k, 3 + k), 16) * (1 - t) + parseInt(cb.slice(1 + k, 3 + k), 16) * t));
  // Relative luminance decides dark or white text.
  const lum = rgb.map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
  return { fill: `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`, ink: L > 0.22 ? "#1d2633" : "#ffffff" };
}

export const EV_FRIENDLINESS: EvFriendlyData = computeEvFriendliness(raw as unknown as EvInputs);
