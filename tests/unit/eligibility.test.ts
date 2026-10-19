import { describe, expect, it } from "vitest";
import { evaluateEligibility } from "@/lib/eligibility/evaluate";
import { normalizedProgramSchema, type NormalizedProgram } from "@/lib/domain/program";

/** TEST FIXTURE: a synthetic program with structured rules. Not a real program. */
function fixture(over: Partial<NormalizedProgram> = {}): NormalizedProgram {
  return normalizedProgramSchema.parse({
    id: "test:1",
    sourceId: "test",
    externalId: "1",
    name: "Fixture EV Rebate",
    providerName: "Fixture Agency",
    providerType: "state",
    categories: ["ev_purchase"],
    benefitTypes: ["post_purchase_rebate"],
    summary: "Synthetic.",
    coverage: { type: "state", states: ["CA"], confidence: "source_stated" },
    eligibility: {
      income: { type: "magi_by_filing_status", limits: { joint: 300000, head_of_household: 225000, other: 150000 }, basis: "test" },
      vehicle: { condition: ["new"], acquisition: ["purchase", "lease"], maxPrice: 55000, qualifyingModels: [{ make: "Acme", model: "Volt", years: [2025, 2026] }] },
      ownership: "either",
    },
    application: {},
    programUrl: "https://example.com/p",
    status: "active",
    statusBasis: "test",
    sourceUrl: "https://example.com/p",
    retrievedAt: "2026-10-19T00:00:00Z",
    verificationMethod: "test",
    isFixture: true,
    ...over,
  });
}

describe("eligibility evaluation", () => {
  it("is 'relevant' when a program has no structured rules", () => {
    const p = fixture({ eligibility: { summary: [], restrictions: [] } });
    expect(evaluateEligibility(p, {}).verdict).toBe("relevant");
  });
  it("needs info when rules exist but nothing was entered, and names what is missing", () => {
    const r = evaluateEligibility(fixture(), {});
    expect(r.verdict).toBe("needs_info");
    expect(r.missing).toEqual(expect.arrayContaining(["household income", "new or used vehicle", "vehicle price", "vehicle make, model, and year"]));
  });
  it("verifies when every stated rule passes", () => {
    const r = evaluateEligibility(fixture(), { householdIncome: 120000, taxFiling: "single", vehicle: { condition: "new", acquisition: "lease", price: 50000, make: "acme", model: "volt", year: 2026 } });
    expect(r.verdict).toBe("verified");
  });
  it("flags likely ineligible on an income limit by filing status", () => {
    expect(evaluateEligibility(fixture(), { householdIncome: 160000, taxFiling: "single" }).verdict).toBe("likely_ineligible");
    expect(evaluateEligibility(fixture(), { householdIncome: 160000, taxFiling: "joint" }).verdict).not.toBe("likely_ineligible");
  });
  it("never infers that a whole brand qualifies", () => {
    const r = evaluateEligibility(fixture(), { householdIncome: 1, vehicle: { condition: "new", price: 1, make: "Acme", model: "Other", year: 2026 } });
    expect(r.verdict).toBe("likely_ineligible");
    expect(r.reasons.join(" ")).toMatch(/not on the source's list/);
  });
  it("does not check a vehicle against a list the source does not publish", () => {
    const p = fixture({ eligibility: { vehicle: { condition: ["used"] }, summary: [], restrictions: [] } });
    const r = evaluateEligibility(p, { vehicle: { condition: "used", make: "Any", model: "Thing" } });
    expect(r.verdict).toBe("verified");
    expect(r.reasons.join(" ")).toMatch(/does not publish a per-model list/);
  });
  it("handles household-size income tables and unknown sizes", () => {
    const p = fixture({ eligibility: { income: { type: "max_by_household_size", limits: [50000, 60000, 70000], basis: "test" }, summary: [], restrictions: [] } });
    expect(evaluateEligibility(p, { householdIncome: 65000 }).verdict).toBe("needs_info");
    expect(evaluateEligibility(p, { householdIncome: 65000, householdSize: 2 }).verdict).toBe("likely_ineligible");
    expect(evaluateEligibility(p, { householdIncome: 65000, householdSize: 5 }).verdict).toBe("verified");
  });
  it("treats text-only income rules as unknown, never as a pass", () => {
    const p = fixture({ eligibility: { income: { type: "text_only", basis: "see text" }, summary: [], restrictions: [] } });
    expect(evaluateEligibility(p, { householdIncome: 1 }).verdict).toBe("needs_info");
  });
  it("checks ownership", () => {
    const p = fixture({ eligibility: { ownership: "homeowner", summary: [], restrictions: [] } });
    expect(evaluateEligibility(p, { ownerStatus: "renter" }).verdict).toBe("likely_ineligible");
    expect(evaluateEligibility(p, {}).verdict).toBe("needs_info");
  });
});
