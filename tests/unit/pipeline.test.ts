import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createDb, migrateDb, type DB } from "@/lib/db/client";
import { ensureSources } from "@/lib/sources/registry";
import { normalizeAfdcLaw, type AfdcLaw } from "@/lib/sources/afdc";
import { upsertPrograms, runOne } from "@/lib/pipeline/ingest";
import { programs, reviewItems, ingestionRuns } from "@/lib/db/schema";
import { afdcAdapter } from "@/lib/sources/afdc";
import { eq } from "drizzle-orm";

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/afdc-sample.json"), "utf8")) as { result: AfdcLaw[] };
const NOW = new Date("2026-10-19T00:00:00Z");

let db: DB;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await createDb({ memory: true }));
  await migrateDb(db);
  await ensureSources(db, {});
});
afterAll(() => close());

describe("AFDC normalization", () => {
  it("normalizes a utility rebate with provider, categories, and quoted amounts", () => {
    const n = normalizeAfdcLaw(fixture.result[0], NOW.toISOString(), NOW);
    expect("reject" in n).toBe(false);
    if ("reject" in n) return;
    expect(n.id).toBe("afdc:900001");
    expect(n.providerName).toBe("Example Utility");
    expect(n.providerType).toBe("utility");
    expect(n.categories).toContain("ev_purchase");
    expect(n.benefitTypes).toEqual(["rebate_timing_unknown"]);
    expect(n.coverage.type).toBe("utility");
    expect(n.coverage.confidence).toBe("unverified");
    expect(n.amounts![0].kind).toBe("text");
    expect(n.amounts![0].evidence?.quote).toContain("$500");
    expect(n.programUrl).toBe("https://example.com/ev-rebate");
    expect(n.eligibility.income?.type).toBe("text_only");
    expect(n.status).toBe("active");
  });
  it("classifies home charging and expired TOU rates", () => {
    const c = normalizeAfdcLaw(fixture.result[1], NOW.toISOString(), NOW);
    const t = normalizeAfdcLaw(fixture.result[2], NOW.toISOString(), NOW);
    if ("reject" in c || "reject" in t) throw new Error("rejected");
    expect(c.categories).toContain("home_charging");
    expect(c.programUrl).toBe("https://afdc.energy.gov/laws/900002");
    expect(t.categories).toContain("utility_rate");
    expect(t.benefitTypes).toEqual(["rate_plan"]);
    expect(t.status).toBe("closed");
    expect(t.endDate).toBe("2026-06-30T00:00:00Z");
  });
  it("rejects laws that are not incentives or are in unsupported jurisdictions", () => {
    expect(normalizeAfdcLaw({ ...fixture.result[0], type: "Laws and Regulations" }, NOW.toISOString(), NOW)).toHaveProperty("reject");
    expect(normalizeAfdcLaw({ ...fixture.result[0], state: "PR" }, NOW.toISOString(), NOW)).toHaveProperty("reject");
  });
});

describe("ingestion", () => {
  it("inserts, detects unchanged, flags material changes, and marks missing records", async () => {
    const records = fixture.result.map((l) => normalizeAfdcLaw(l, NOW.toISOString(), NOW)).filter((r) => !("reject" in r));
    const first = await upsertPrograms(db, "afdc", records as never);
    expect(first.inserted).toBe(3);
    const second = await upsertPrograms(db, "afdc", records as never);
    expect(second.unchanged).toBe(3);
    expect(second.updated).toBe(0);
    // A changed amount is a material change: record updated, snapshot kept, review item opened.
    const changed = structuredClone(records) as typeof records;
    (changed[0] as { amounts: { label: string }[] }).amounts[0].label = "rebate of $750";
    const third = await upsertPrograms(db, "afdc", [changed[0]] as never, { markMissing: true });
    expect(third.updated).toBe(1);
    expect(third.flagged).toBe(1);
    expect(third.missing).toBe(2);
    const items = await db.select().from(reviewItems);
    expect(items.map((i) => i.reason).sort()).toEqual(["material_change", "missing_from_source", "missing_from_source"]);
    const [p] = await db.select().from(programs).where(eq(programs.id, "afdc:900002"));
    expect(p.sourceUnavailableSince).not.toBeNull();
    expect(p.reviewState).toBe("published"); // still visible, with a warning
  });
  it("refuses fixture-flagged records outside tests", async () => {
    const r = normalizeAfdcLaw(fixture.result[0], NOW.toISOString(), NOW);
    const res = await upsertPrograms(db, "afdc", [{ ...(r as object), isFixture: true }] as never);
    expect(res.rejected).toBe(1);
    expect(res.rejectedReasons[0]).toMatch(/fixture/);
  });
  it("skips a source whose credentials are missing and records the run", async () => {
    const res = await runOne(db, afdcAdapter, {}, "test");
    expect(res.status).toBe("skipped");
    const runs = await db.select().from(ingestionRuns);
    expect(runs.at(-1)?.status).toBe("skipped");
  });
  it("records a failed run when the source is unreachable, without deleting records", async () => {
    const res = await runOne(db, afdcAdapter, { NREL_API_KEY: "x" }, "test", {
      fetchImpl: async () => new Response("boom", { status: 503 }),
    });
    expect(res.status).toBe("failed");
    const rows = await db.select().from(programs);
    expect(rows.length).toBe(3);
  });
});
