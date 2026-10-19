import { describe, expect, it } from "vitest";
import { lookupZip, normalizeZip } from "@/lib/geo/zip";
import { lonLatToPseudo, PSEUDO_BOUNDS } from "@/lib/geo/projection";
import { isSupportedState, stateByAbbr, SUPPORTED_STATES } from "@/lib/geo/states";

describe("ZIP validation", () => {
  it("accepts 5-digit and ZIP+4 forms only", () => {
    expect(normalizeZip("94110")).toBe("94110");
    expect(normalizeZip(" 94110-1234 ")).toBe("94110");
    expect(normalizeZip("941101234")).toBe("94110");
    expect(normalizeZip("9411")).toBeNull();
    expect(normalizeZip("2024-01-15")).toBeNull();
    expect(normalizeZip("abcde")).toBeNull();
    expect(normalizeZip("")).toBeNull();
    expect(normalizeZip(null)).toBeNull();
  });
});

describe("ZIP geographic lookup (Census ZCTA)", () => {
  it("resolves ZIPs in every kind of place, including AK, HI and DC", () => {
    expect(lookupZip("94110")).toMatchObject({ state: "CA", countyFips: "06075", countyName: "San Francisco", supported: true });
    expect(lookupZip("99501")).toMatchObject({ state: "AK", supported: true });
    expect(lookupZip("96813")).toMatchObject({ state: "HI", supported: true });
    expect(lookupZip("20001")).toMatchObject({ state: "DC", countyFips: "11001", supported: true });
    expect(lookupZip("02139")).toMatchObject({ state: "MA" });
  });
  it("marks territories as unsupported rather than failing", () => {
    expect(lookupZip("00601")).toMatchObject({ state: "PR", supported: false });
  });
  it("returns null for well-formed ZIPs that are not ZCTAs", () => {
    expect(lookupZip("00000")).toBeNull();
  });
  it("keeps secondary counties for ZIPs that cross county lines", () => {
    const z = lookupZip("73949")!;
    expect(z.countyFips).toBe("40139");
    expect(z.otherCountyFips).toContain("48421");
  });
});

describe("state metadata", () => {
  it("has 50 states plus DC supported", () => {
    expect(SUPPORTED_STATES).toHaveLength(51);
    expect(isSupportedState("dc")).toBe(true);
    expect(isSupportedState("PR")).toBe(false);
    expect(stateByAbbr("ZZ")).toBeUndefined();
  });
});

describe("map projection", () => {
  it("places Alaska and Hawaii inside the composite drawing bounds", () => {
    const [[minX, minY], [maxX, maxY]] = PSEUDO_BOUNDS;
    for (const [lon, lat] of [[-149.9, 61.2], [-157.8, 21.3], [-77.0, 38.9], [-122.4, 37.7]]) {
      const p = lonLatToPseudo(lon, lat)!;
      expect(p[0]).toBeGreaterThan(minX);
      expect(p[0]).toBeLessThan(maxX);
      expect(p[1]).toBeGreaterThan(minY);
      expect(p[1]).toBeLessThan(maxY);
    }
  });
  it("returns null for places outside the composite (Puerto Rico)", () => {
    expect(lonLatToPseudo(-66.5, 18.2)).toBeNull();
  });
});
