import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, migrateDb, type DB } from "@/lib/db/client";
import { ensureSources } from "@/lib/sources/registry";
import { upsertPrograms } from "@/lib/pipeline/ingest";
import { search, stateCounts } from "@/lib/search/service";
import { parseShareable } from "@/lib/search/params";
import type { NormalizedProgramInput } from "@/lib/domain/program";
import { programs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/** TEST FIXTURES: synthetic programs exercising coverage types. Not real programs. */
const base = (over: Partial<NormalizedProgramInput>): NormalizedProgramInput => ({
  id: "afdc:1",
  sourceId: "afdc",
  externalId: "1",
  name: "Fixture",
  providerName: "Fixture Provider",
  providerType: "state",
  categories: ["ev_purchase"],
  benefitTypes: ["post_purchase_rebate"],
  summary: "Synthetic test record.",
  coverage: { type: "state", states: ["CA"], confidence: "source_stated" },
  eligibility: {},
  application: {},
  programUrl: "https://example.com/1",
  status: "active",
  statusBasis: "test",
  sourceUrl: "https://example.com/1",
  retrievedAt: new Date().toISOString(),
  verificationMethod: "test",
  ...over,
});

let db: DB;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createDb({ memory: true }));
  await migrateDb(db);
  await ensureSources(db, {});
  await upsertPrograms(db, "afdc", [
    base({ id: "afdc:1", externalId: "1", name: "California Statewide EV Rebate" }),
    base({ id: "afdc:2", externalId: "2", name: "Example Utility Charger Rebate", providerType: "utility", categories: ["home_charging"], coverage: { type: "utility", states: ["CA"], utilityNames: ["Example Utility"], confidence: "unverified" }, programUrl: "https://example.com/2", sourceUrl: "https://example.com/2" }),
    base({ id: "afdc:3", externalId: "3", name: "Nevada Solar Thing", categories: ["solar"], coverage: { type: "state", states: ["NV"], confidence: "source_stated" }, programUrl: "https://example.com/3", sourceUrl: "https://example.com/3" }),
    base({ id: "afdc:4", externalId: "4", name: "Closed Texas Program", status: "closed", endDate: "2025-01-01", coverage: { type: "state", states: ["TX"], confidence: "source_stated" }, programUrl: "https://example.com/4", sourceUrl: "https://example.com/4" }),
  ]);
  await upsertPrograms(db, "federal_curated", [base({ id: "federal_curated:n", sourceId: "federal_curated", externalId: "n", name: "Nationwide Credit", providerType: "federal", benefitTypes: ["tax_credit"], coverage: { type: "national", states: [], confidence: "verified" }, programUrl: "https://example.com/n", sourceUrl: "https://example.com/n" })]);
});
afterAll(() => close());

describe("search by geography", () => {
  it("returns nationwide + statewide + utility programs for a ZIP, never other states", async () => {
    const r = await search(db, parseShareable({ zip: "94110" }), {}, {});
    const ids = r.programs.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["federal_curated:n", "afdc:1", "afdc:2"]));
    expect(ids).not.toContain("afdc:3");
    expect(r.location?.state?.abbr).toBe("CA");
    expect(r.programs.find((p) => p.id === "afdc:2")?.coverage.confidence).toBe("unverified");
    // On-demand sources are reported as not connected rather than silently skipped.
    expect(r.sourcesStatus.find((s) => s.id === "rewiring_america")?.state).toBe("not_configured");
    expect(r.coverageNotes.join(" ")).toMatch(/not connected/);
  });
  it("returns nationwide + statewide for a state selection", async () => {
    const r = await search(db, parseShareable({ state: "NV" }), {}, {});
    expect(r.programs.map((p) => p.id).sort()).toEqual(["afdc:3", "federal_curated:n"]);
  });
  it("distinguishes 'filters too restrictive' from 'no matches'", async () => {
    const strict = await search(db, parseShareable({ state: "NV", cat: "battery" }), {}, {});
    expect(strict.programs).toHaveLength(0);
    expect(strict.emptyReason).toBe("filters_too_restrictive");
    expect(strict.totalBeforeFilters).toBe(2);
  });
  it("applies status, benefit, utility and keyword filters", async () => {
    expect((await search(db, parseShareable({ state: "TX", status: "closed" }), {}, {})).programs.map((p) => p.id)).toEqual(["afdc:4"]);
    expect((await search(db, parseShareable({ state: "CA", benefit: "tax_credit" }), {}, {})).programs.map((p) => p.id)).toEqual(["federal_curated:n"]);
    expect((await search(db, parseShareable({ zip: "94110", utility: "example" }), {}, {})).programs.map((p) => p.id)).toEqual(["afdc:2"]);
    expect((await search(db, parseShareable({ state: "CA", q: "charger" }), {}, {})).programs.map((p) => p.id)).toEqual(["afdc:2"]);
  });
  it("reports unknown ZIPs and unsupported areas without pretending no programs exist", async () => {
    expect((await search(db, parseShareable({ zip: "00000" }), {}, {})).emptyReason).toBe("no_location");
    expect((await search(db, parseShareable({ zip: "00601" }), {}, {})).emptyReason).toBe("unsupported_area");
  });
  it("hides rejected records and excludes fixtures from counts", async () => {
    await db.update(programs).set({ reviewState: "rejected" }).where(eq(programs.id, "afdc:3"));
    expect((await search(db, parseShareable({ state: "NV" }), {}, {})).programs.map((p) => p.id)).toEqual(["federal_curated:n"]);
    const counts = await stateCounts(db);
    expect(counts.CA).toBe(2);
    expect(counts.NV).toBeUndefined();
  });
  it("keeps a record visible, with a warning, when its source stops returning it", async () => {
    await upsertPrograms(db, "afdc", [base({ id: "afdc:1", externalId: "1", name: "California Statewide EV Rebate" })], { markMissing: true });
    const r = await search(db, parseShareable({ zip: "94110" }), {}, {});
    const gone = r.programs.find((p) => p.id === "afdc:2");
    expect(gone).toBeDefined();
    expect(gone?.sourceUnavailableSince).toBeTruthy();
  });
});
