import { describe, expect, it } from "vitest";
import { parseShareable, redactForLog, sensitiveSchema, toSearchString } from "@/lib/search/params";

describe("shareable URL state", () => {
  it("parses and round-trips search and filter state", () => {
    const p = parseShareable(new URLSearchParams("zip=94110&cat=solar,battery&benefit=tax_credit&status=active&q=charger&view=map&sel=afdc:1"));
    expect(p).toMatchObject({ zip: "94110", cat: ["solar", "battery"], benefit: ["tax_credit"], status: ["active"], q: "charger", view: "map", sel: "afdc:1" });
    expect(toSearchString(p)).toBe("?zip=94110&q=charger&cat=solar%2Cbattery&benefit=tax_credit&status=active&view=map&sel=afdc%3A1");
  });
  it("drops invalid values instead of throwing", () => {
    const p = parseShareable(new URLSearchParams("zip=12&state=XX&cat=bogus,solar&deadlineBefore=soon"));
    expect(p.zip).toBeUndefined();
    expect(p.state).toBeUndefined();
    expect(p.cat).toEqual(["solar"]);
    expect(p.deadlineBefore).toBeUndefined();
  });
  it("never carries sensitive values in the URL", () => {
    const p = parseShareable(new URLSearchParams("zip=94110&householdIncome=50000&income=1&vehicle=tesla"));
    expect(JSON.stringify(p)).not.toMatch(/50000|tesla/);
    expect(toSearchString({ ...p, householdIncome: 50000 } as never)).not.toMatch(/50000/);
  });
});

describe("sensitive inputs", () => {
  it("validates ranges", () => {
    expect(sensitiveSchema.safeParse({ householdIncome: -1 }).success).toBe(false);
    expect(sensitiveSchema.safeParse({ householdSize: 9 }).success).toBe(false);
    expect(sensitiveSchema.safeParse({ householdIncome: 50000, householdSize: 3, vehicle: { price: 30000 } }).success).toBe(true);
  });
  it("redacts sensitive keys before logging", () => {
    const out = redactForLog({ params: { zip: "94110" }, sensitive: { householdIncome: 50000, vehicle: { make: "x" } } }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toMatch(/50000|"x"/);
    expect(JSON.stringify(out)).toMatch(/94110/);
  });
});
