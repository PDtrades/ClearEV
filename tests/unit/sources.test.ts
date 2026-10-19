import { describe, expect, it } from "vitest";
import { normalizeRaIncentive, stableRaId, type RaIncentive, type RaResponse } from "@/lib/sources/rewiring-america";
import { normalizeUrdbRate } from "@/lib/sources/openei";
import { collectQuotes, loadCuratedFile, quoteAppears } from "@/lib/sources/curated";
import path from "node:path";

const loc = { zip: "94110", lat: 37.75, lng: -122.4152, state: "CA" };
const NOW = "2026-10-19T00:00:00Z";

/** TEST FIXTURE in the shape of a Rewiring America incentive. Not a real program. */
const ra: RaIncentive = {
  payment_methods: ["pos_rebate"],
  authority_type: "utility",
  authority: "example-utility",
  program: "Example Utility EV Charger Rebate",
  program_url: "https://example.com/charger",
  items: ["electric_vehicle_charger"],
  amount: { type: "percent", number: 0.5, maximum: 500 },
  owner_status: ["homeowner"],
  short_description: "Half off a Level 2 charger, up to $500.",
};
const res: RaResponse = { is_under_80_ami: false, is_under_150_ami: true, is_over_150_ami: false, authorities: { "example-utility": { name: "Example Utility" } }, coverage: { state: "CA", utility: "example-utility" }, location: { state: "CA" }, incentives: [ra] };

describe("Rewiring America normalization", () => {
  it("maps payment methods, items, amounts and owner status without inventing anything", () => {
    const p = normalizeRaIncentive(ra, res, loc, NOW, true)!;
    expect(p.benefitTypes).toEqual(["pos_rebate"]);
    expect(p.categories).toEqual(["home_charging"]);
    expect(p.amounts[0]).toMatchObject({ kind: "percent", value: 50, maximum: 500, label: "50% of cost, up to $500" });
    expect(p.eligibility.ownership).toBe("homeowner");
    expect(p.eligibility.income?.type).toBe("source_screened");
    expect(p.coverage).toMatchObject({ type: "utility", utilityNames: ["Example Utility"], confidence: "source_stated" });
    expect(p.providerName).toBe("Example Utility");
    expect(p.status).toBe("active");
  });
  it("labels unscreened results and paused programs honestly", () => {
    const p = normalizeRaIncentive({ ...ra, paused: true }, res, loc, NOW, false)!;
    expect(p.status).toBe("exhausted");
    expect(p.uncertainties.join(" ")).toMatch(/placeholder household values/);
    expect(p.eligibility.income?.type).toBe("text_only");
  });
  it("drops records without a usable https program URL", () => {
    expect(normalizeRaIncentive({ ...ra, program_url: "http://insecure.example" }, res, loc, NOW, true)).toBeNull();
  });
  it("has stable ids across runs", () => {
    expect(stableRaId(ra)).toBe(stableRaId({ ...ra, short_description: "changed copy" }));
    expect(stableRaId(ra)).not.toBe(stableRaId({ ...ra, amount: { type: "percent", number: 0.3 } }));
  });
});

describe("OpenEI URDB normalization", () => {
  it("keeps only EV or time-of-use residential rates and never calls them rebates", () => {
    const base = { label: "abc123", utility: "Example Power", name: "Residential EV Time-of-Use", sector: "Residential", approved: true, uri: "https://apps.openei.org/USURDB/rate/view/abc123", source: "https://example.com/tariff.pdf" };
    const p = normalizeUrdbRate(base, loc, NOW)!;
    expect(p.categories).toEqual(["utility_rate"]);
    expect(p.benefitTypes).toEqual(["rate_plan"]);
    expect(p.programUrl).toBe("https://example.com/tariff.pdf");
    expect(p.coverage.confidence).toBe("source_stated");
    expect(normalizeUrdbRate({ ...base, name: "Residential Standard Service" }, loc, NOW)).toBeNull();
  });
});

describe("curated federal records", () => {
  const file = loadCuratedFile(path.join(process.cwd(), "data/curated/federal.json"));
  it("carries a verbatim quote for every amount, income rule, vehicle rule and status", () => {
    for (const r of file.records) {
      const quotes = collectQuotes(r);
      expect(quotes.length, r.id).toBeGreaterThanOrEqual(2);
      for (const q of quotes) expect(q.url, r.id).toMatch(/^https:\/\/www\.irs\.gov\//);
      expect(r.programUrl).toMatch(/^https:\/\/www\.irs\.gov\//);
      expect(r.isFixture ?? false).toBe(false);
    }
  });
  it("quote matching tolerates whitespace and curly quotes but not changed numbers", () => {
    expect(quoteAppears("The credit  equals 30% of the sale price up to a maximum credit of $4,000.", "The credit equals 30% of the sale price up to a maximum credit of $4,000.")).toBe(true);
    expect(quoteAppears("The credit equals 25% of the sale price up to a maximum credit of $4,000.", "The credit equals 30% of the sale price up to a maximum credit of $4,000.")).toBe(false);
  });
});
