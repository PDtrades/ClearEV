import { describe, expect, it } from "vitest";
import { collapseDuplicates, materiallyDifferent, scorePair } from "@/lib/pipeline/dedupe";
import { normalizedProgramSchema, type NormalizedProgram } from "@/lib/domain/program";

/** TEST FIXTURE builder. */
const mk = (over: Partial<NormalizedProgram>): NormalizedProgram =>
  normalizedProgramSchema.parse({
    id: "a:1",
    sourceId: "a",
    externalId: "1",
    name: "Home Charger Rebate",
    providerName: "Example Electric",
    providerType: "utility",
    categories: ["home_charging"],
    benefitTypes: ["post_purchase_rebate"],
    summary: "x",
    amounts: [{ kind: "flat", value: 500, label: "$500" }],
    coverage: { type: "utility", states: ["CA"], utilityNames: ["Example Electric"], confidence: "source_stated" },
    eligibility: {},
    application: {},
    programUrl: "https://example.com/charger",
    status: "active",
    statusBasis: "t",
    sourceUrl: "https://example.com/charger",
    retrievedAt: "2026-10-19T00:00:00Z",
    verificationMethod: "t",
    isFixture: true,
    ...over,
  });

describe("deduplication", () => {
  it("matches the same offer from two sources by official URL", () => {
    const a = mk({});
    const b = mk({ id: "b:9", sourceId: "b", name: "Home Charger Rebate Program" });
    expect(scorePair(a, b)?.why).toBe("same official program URL");
  });
  it("never merges materially different offers", () => {
    const a = mk({});
    expect(materiallyDifferent(a, mk({ amounts: [{ kind: "flat", value: 1000, label: "$1,000" }] }))).toBe("different stated amounts");
    expect(materiallyDifferent(a, mk({ benefitTypes: ["tax_credit"] }))).toBe("different benefit types");
    expect(materiallyDifferent(a, mk({ categories: ["solar"] }))).toBe("no shared category");
    expect(scorePair(a, mk({ id: "b:1", sourceId: "b", amounts: [{ kind: "flat", value: 1000, label: "$1,000" }] }))).toBeNull();
  });
  it("does not treat two different AFDC summary pages as the same program", () => {
    const a = mk({ programUrl: "https://afdc.energy.gov/laws/1" });
    const b = mk({ id: "b:2", sourceId: "b", name: "Different Name", programUrl: "https://afdc.energy.gov/laws/1" });
    expect(scorePair(a, b)).toBeNull();
  });
  it("collapses duplicates in priority order and reports what was hidden", () => {
    const low = mk({ id: "afdc:1", sourceId: "afdc" });
    const high = mk({ id: "ra:1", sourceId: "ra" });
    const { kept, collapsed } = collapseDuplicates([low, high], (s) => (s === "ra" ? 1 : 2));
    expect(kept.map((k) => k.id)).toEqual(["ra:1"]);
    expect(collapsed.get("ra:1")).toEqual(["afdc:1"]);
  });
});
