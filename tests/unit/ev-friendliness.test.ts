import { describe, expect, it } from "vitest";
import { computeEvFriendliness } from "@/lib/geo/ev-friendliness";

// TEST FIXTURE values: synthetic inputs exercising the scoring rules only.
describe("EV-friendliness score", () => {
  const d = computeEvFriendliness({
    sources: null,
    states: {
      AA: { chargerPorts: 1000, population: 1_000_000, cost: 10 }, // dense + cheap
      BB: { chargerPorts: 100, population: 1_000_000, cost: 30 }, // sparse + expensive
      CC: { chargerPorts: 500, population: 1_000_000, cost: 20 },
      DD: { chargerPorts: null, population: 1_000_000, cost: 15 },
    },
  });
  it("ranks more chargers per resident and cheaper charging as friendlier", () => {
    expect(d.rows.AA.score).toBe(100);
    expect(d.rows.BB.score).toBe(0);
    expect(d.rows.CC.score).toBe(42); // chargers 50th of 3, cost 33rd of 4
    expect(d.rows.AA.portsPer100k).toBe(100);
  });
  it("gives no score when a measure is missing, instead of guessing", () => {
    expect(d.rows.DD.score).toBeNull();
    expect(d.rows.DD.costPct).not.toBeNull();
  });
});
