import { describe, expect, it } from "vitest";
import { computeEvFriendliness, scoreColor } from "@/lib/geo/ev-friendliness";

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

describe("scoreColor", () => {
  it("uses the end stops at 0 and 100 and clamps beyond them", () => {
    expect(scoreColor(0).fill).toBe("#c8553d");
    expect(scoreColor(100).fill).toBe("#1d8a5a");
    expect(scoreColor(-5).fill).toBe("#c8553d");
    expect(scoreColor(140).fill).toBe("#1d8a5a");
  });
  it("hits the middle stops exactly and blends between them", () => {
    expect(scoreColor(35).fill).toBe("#e9a23b");
    expect(scoreColor(60).fill).toBe("#8fbf4d");
    expect(scoreColor(47).fill).not.toMatch(/^#(e9a23b|8fbf4d)$/);
  });
  it("picks dark text on light fills and white on dark ones", () => {
    expect(scoreColor(35).ink).toBe("#1d2633");
    expect(scoreColor(100).ink).toBe("#ffffff");
  });
});

