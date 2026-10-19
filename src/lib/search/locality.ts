import type { ProgramView } from "../domain/program";

type Coverage = Pick<ProgramView, "coverage" | "providerName">;
type ZipCounties = { countyFips: string; otherCountyFips: string[] };

/** True when the source names counties and none of them contains the ZIP, so the program cannot apply there. */
export function outsideZipCounties(p: Coverage, zip: ZipCounties | null | undefined): boolean {
  if (!zip || !p.coverage.counties.length) return false;
  const here = new Set([zip.countyFips, ...zip.otherCountyFips]);
  return !p.coverage.counties.some((c) => here.has(c));
}

/** True when a utility program's provider is one of the utilities a source reported for this ZIP. */
export function servesZip(p: Coverage, utilities: string[]): boolean {
  const names = [p.providerName, ...p.coverage.utilityNames].map((n) => n.toLowerCase());
  return utilities.some((u) => names.some((n) => n.includes(u.toLowerCase()) || u.toLowerCase().includes(n)));
}

/** Utility programs ClearEV lists state-wide because it cannot tell which utility serves the ZIP. */
export function unconfirmedUtility(p: Coverage, zip: ZipCounties | null | undefined, utilities: string[]): boolean {
  return !!zip && p.coverage.type === "utility" && !p.coverage.counties.length && !servesZip(p, utilities);
}

/** Sort key for scope: places confirmed to cover the ZIP first, then state-wide, then unconfirmed utilities, then national. */
export function scopeRank(p: Coverage, zip: ZipCounties | null | undefined, utilities: string[]): number {
  if (p.coverage.type === "national") return 3;
  if (p.coverage.type === "utility") return unconfirmedUtility(p, zip, utilities) ? 2 : 0;
  if (p.coverage.type === "state" || p.coverage.type === "unknown") return 1;
  return 0;
}

export function utilityNote(stateName: string, zip: string): string {
  return `Utility programs are listed for all of ${stateName} because ClearEV can't yet tell which utility serves ZIP ${zip}. Check the "Where" line on each one.`;
}
