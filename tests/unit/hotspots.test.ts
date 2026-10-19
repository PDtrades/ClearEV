import { describe, expect, it } from "vitest";
import { computeHotspots, largestStatedAmount, rankCountyGroups, rankHotspots, statedDollars } from "@/lib/search/hotspots";

// TEST FIXTURE shapes only: synthetic programs exercising the ranking rules.
type P = Parameters<typeof computeHotspots>[0][number];
const prog = (id: string, over: Partial<P> = {}): P => ({
  id: `test:${id}`,
  name: `Program ${id}`,
  amounts: [],
  coverage: { type: "state", states: ["CO"], counties: [], zips: [], utilityNames: [], confidence: "source_stated" },
  status: "active",
  reviewState: "published",
  ...over,
});

describe("hotspots", () => {
  it("reads only stated dollar figures", () => {
    expect(statedDollars({ kind: "flat", value: 5000, label: "" })).toBe(5000);
    expect(statedDollars({ kind: "percent", value: 30, label: "" })).toBeUndefined();
    expect(statedDollars({ kind: "percent", value: 30, maximum: 1000, label: "" })).toBe(1000);
    expect(statedDollars({ kind: "text", label: "Up to a lot" })).toBeUndefined();
    expect(largestStatedAmount(prog("a", { amounts: [{ kind: "flat", value: 2000, label: "a" }, { kind: "flat", value: 6000, label: "b" }] }))?.value).toBe(6000);
  });

  it("skips national, closed, exhausted and unpublished programs", () => {
    const d = computeHotspots([
      prog("nat", { coverage: { type: "national", states: [], counties: [], zips: [], utilityNames: [], confidence: "verified" } }),
      prog("closed", { status: "closed" }),
      prog("gone", { status: "exhausted" }),
      prog("hidden", { reviewState: "needs_review" }),
      prog("open"),
    ]);
    expect(d.counted).toBe(1);
    expect(d.states).toHaveLength(1);
    expect(d.states[0]).toMatchObject({ key: "CO", programs: 1 });
  });

  it("ranks by count or by the largest single amount, never by a sum", () => {
    const d = computeHotspots([
      prog("co1", { amounts: [{ kind: "flat", value: 3000, label: "" }] }),
      prog("co2", { amounts: [{ kind: "flat", value: 3000, label: "" }] }),
      prog("nj", { coverage: { type: "state", states: ["NJ"], counties: [], zips: [], utilityNames: [], confidence: "source_stated" }, amounts: [{ kind: "flat", value: 4000, label: "" }] }),
    ]);
    expect(rankHotspots(d.states, "programs").map((h) => h.key)).toEqual(["CO", "NJ"]);
    expect(rankHotspots(d.states, "amount").map((h) => h.key)).toEqual(["NJ", "CO"]);
    expect(d.states.find((h) => h.key === "CO")?.top?.value).toBe(3000);
  });

  it("counts county programs for each named county and its state", () => {
    const d = computeHotspots([prog("la", { coverage: { type: "county", states: ["CA"], counties: ["06037", "06059", "bad"], zips: [], utilityNames: [], confidence: "source_stated" } })]);
    expect(d.counties.map((c) => c.key).sort()).toEqual(["06037", "06059"]);
    expect(d.states[0].key).toBe("CA");
    expect(rankHotspots(d.states, "amount")).toEqual([]);
  });

  it("counts city and utility programs toward the counties their source names", () => {
    const d = computeHotspots([
      prog("nyc", { coverage: { type: "municipality", states: ["NY"], counties: ["36061", "36047"], zips: [], utilityNames: [], confidence: "source_stated" } }),
      prog("pge", { coverage: { type: "utility", states: ["CA"], counties: [], zips: [], utilityNames: ["PG&E"], confidence: "source_stated" } }),
    ]);
    expect(d.counties.map((c) => c.key).sort()).toEqual(["36047", "36061"]);
    expect(d.counties[0].programIds).toEqual(["test:nyc"]);
    expect(d.counties[0].programNames).toHaveLength(1);
    expect(d.states.map((s) => s.key).sort()).toEqual(["CA", "NY"]);
  });

  it("merges counties that share the same programs into one entry", () => {
    const cov = (counties: string[]) => ({ type: "county" as const, states: ["CA"], counties, zips: [], utilityNames: [], confidence: "source_stated" as const });
    const d = computeHotspots([
      prog("bay", { coverage: cov(["06001", "06075", "06085"]), amounts: [{ kind: "flat", value: 12000, label: "" }] }),
      prog("la", { coverage: cov(["06037"]), amounts: [{ kind: "flat", value: 9000, label: "" }] }),
    ]);
    const g = rankCountyGroups(d.counties, "amount");
    expect(g.map((x) => x.counties.length)).toEqual([3, 1]);
    expect(g[0].top?.value).toBe(12000);
  });
});
