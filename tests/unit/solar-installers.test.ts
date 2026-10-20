import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { installersFor, rebateText, type SolarInstallerData } from "@/lib/solar/installers";

const fixture: SolarInstallerData = JSON.parse(fs.readFileSync("tests/fixtures/solar-installers.json", "utf8"));

describe("installersFor", () => {
  it("uses the county list when the ZIP's county has one", () => {
    const { result } = installersFor(fixture, "ZZ", "99001");
    expect(result?.scope).toBe("county");
    expect(result?.installers.map((i) => i.name)).toEqual(["Example Rooftops"]);
  });

  it("falls back to the state's top installers", () => {
    const { result } = installersFor(fixture, "ZZ", "99002");
    expect(result?.scope).toBe("state");
    expect(result?.installers[0]).toMatchObject({ name: "Fixture Solar Co", systems: 80, rebateSystems: 60, medianRebate: 1000, thirdPartyOwned: 10, medianPricePerWatt: 3.5 });
  });

  it("explains a missing state instead of returning an empty list", () => {
    expect(installersFor(fixture, "YY").gap).toMatch(/withheld or missing/);
    expect(installersFor(fixture, "XX").gap).toMatch(/not in the records/);
  });
});

describe("rebateText", () => {
  const [a, b, c] = installersFor(fixture, "ZZ").result!.installers;
  it("says when the records give no rebate figure", () => expect(rebateText(b)).toBe("Not reported"));
  it("counts systems with no rebate", () => expect(rebateText(c)).toBe("None of 10"));
  it("gives the share and median", () => expect(rebateText(a)).toBe("60 of 80 · median $1,000"));
});

describe("published installer file", () => {
  const data: SolarInstallerData & { isFixture?: boolean } = JSON.parse(fs.readFileSync("public/geo/solar-installers.json", "utf8"));
  const entries = Object.values(data.states).flatMap((s) => [...s.top, ...Object.values(s.counties).flat()]);

  it("is real data with its source and license", () => {
    expect(data.isFixture).toBeUndefined();
    expect(data.meta.homepage).toBe("https://emp.lbl.gov/tracking-the-sun");
    expect(data.meta.license).toMatch(/Creative Commons Attribution/);
  });

  it("keeps placeholder names out", () => {
    expect(data.names.filter((n) => /^(-1|redacted|self|unknown)$/i.test(n))).toEqual([]);
  });

  it("only has internally consistent counts inside the release window", () => {
    for (const [, systems, last, rebateKnown, rebateSystems, , ownerKnown, tpo] of entries) {
      expect(rebateKnown).toBeLessThanOrEqual(systems);
      expect(rebateSystems).toBeLessThanOrEqual(rebateKnown);
      expect(tpo).toBeLessThanOrEqual(ownerKnown);
      expect(last >= data.meta.window.from.slice(0, 7) && last <= data.meta.window.to.slice(0, 7)).toBe(true);
    }
    for (const s of Object.values(data.states)) for (const list of Object.values(s.counties)) for (const e of list) expect(e[1]).toBeGreaterThanOrEqual(3);
  });
});
