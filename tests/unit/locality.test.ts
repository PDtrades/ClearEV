import { describe, expect, it } from "vitest";
import { outsideZipCounties, scopeRank, unconfirmedUtility } from "@/lib/search/locality";

const prog = (type: string, counties: string[] = [], providerName = "Somewhere Utility", utilityNames: string[] = []) =>
  ({ providerName, coverage: { type, states: ["CA"], counties, zips: [], utilityNames, confidence: "source_stated" } }) as never;
const sf = { countyFips: "06075", otherCountyFips: [] };

describe("ZIP locality", () => {
  it("drops county and city programs whose named counties exclude the ZIP", () => {
    expect(outsideZipCounties(prog("county", ["06019", "06029"]), sf)).toBe(true);
    expect(outsideZipCounties(prog("county", ["06075"]), sf)).toBe(false);
    expect(outsideZipCounties(prog("county", ["06001"]), { countyFips: "06013", otherCountyFips: ["06001"] })).toBe(false);
    expect(outsideZipCounties(prog("state"), sf)).toBe(false);
    expect(outsideZipCounties(prog("county", ["06019"]), null)).toBe(false);
  });

  it("ranks utility programs it cannot place below state programs, and known ones first", () => {
    const ladwp = prog("utility", [], "Los Angeles Department of Water and Power");
    expect(unconfirmedUtility(ladwp, sf, [])).toBe(true);
    expect(scopeRank(ladwp, sf, [])).toBeGreaterThan(scopeRank(prog("state"), sf, []));
    const pge = prog("utility", [], "Pacific Gas and Electric Company (PG&E)");
    expect(scopeRank(pge, sf, ["Pacific Gas and Electric"])).toBe(0);
    expect(unconfirmedUtility(pge, null, [])).toBe(false);
  });
});
