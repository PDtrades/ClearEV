// Solar installers by county and state, built by scripts/build-solar-installers.ts from LBNL's
// Tracking the Sun records. These are companies that installed home systems, not endorsements, and the
// rebate figures are program rebates the records state, not discounts the companies advertise.

/** [nameIndex, systems, lastInstall YYYY-MM, rebateKnown, rebateSystems, medianRebate, ownerKnown, thirdPartyOwned, medianPricePerWatt] */
export type InstallerEntry = [number, number, string, number, number, number | null, number, number, number | null];

export interface StateInstallers {
  dataThrough: string;
  systems: number;
  installers: number;
  /** Bodies that reported the upfront rebates, most systems first. */
  rebateReportedBy: string[];
  top: InstallerEntry[];
  counties: Record<string, InstallerEntry[]>;
}

export interface SolarInstallerData {
  meta: {
    source: string;
    release: string;
    homepage: string;
    dataUrl: string;
    license: string;
    licenseUrl: string;
    builtAt: string;
    window: { from: string; to: string };
    method: string;
  };
  names: string[];
  states: Record<string, StateInstallers>;
  /** States in the file with no usable company names, and why. */
  withoutNames: Record<string, string>;
}

export interface Installer {
  name: string;
  systems: number;
  lastInstall: string;
  /** Systems whose record states a rebate amount (zero included). */
  rebateKnown: number;
  rebateSystems: number;
  medianRebate: number | null;
  ownerKnown: number;
  /** Leased or power-purchase systems, owned by someone other than the home owner. */
  thirdPartyOwned: number;
  medianPricePerWatt: number | null;
}

export interface InstallerResult {
  scope: "county" | "state";
  state: string;
  countyFips?: string;
  dataThrough: string;
  installers: Installer[];
  rebateReportedBy: string[];
  stateSystems: number;
  stateInstallers: number;
}

export interface InstallerLookup {
  result: InstallerResult | null;
  /** Why there is no list, when there isn't one. */
  gap?: string;
  meta: SolarInstallerData["meta"];
}

function expand(names: string[], e: InstallerEntry): Installer {
  const [n, systems, lastInstall, rebateKnown, rebateSystems, medianRebate, ownerKnown, thirdPartyOwned, medianPricePerWatt] = e;
  return { name: names[n], systems, lastInstall, rebateKnown, rebateSystems, medianRebate, ownerKnown, thirdPartyOwned, medianPricePerWatt };
}

/** County list when the ZIP's county has one, else the state's top installers. */
export function installersFor(data: SolarInstallerData, state: string, countyFips?: string): InstallerLookup {
  const meta = data.meta;
  const s = data.states[state];
  if (!s) {
    const why = data.withoutNames[state] ?? "this state is not in the records";
    return { result: null, gap: `No installer list for this state: ${why}.`, meta };
  }
  const base = { state, dataThrough: s.dataThrough, rebateReportedBy: s.rebateReportedBy, stateSystems: s.systems, stateInstallers: s.installers };
  const county = countyFips ? s.counties[countyFips] : undefined;
  if (county) return { result: { ...base, scope: "county", countyFips, installers: county.map((e) => expand(data.names, e)) }, meta };
  return { result: { ...base, scope: "state", installers: s.top.map((e) => expand(data.names, e)) }, meta };
}

const count = (n: number) => n.toLocaleString("en-US");

/** "12 of 40 · median $1,000", or why there is no figure. */
export function rebateText(i: Installer): string {
  if (!i.rebateKnown) return "Not reported";
  if (!i.rebateSystems) return `None of ${count(i.rebateKnown)}`;
  return `${count(i.rebateSystems)} of ${count(i.rebateKnown)}${i.medianRebate != null ? ` · median $${count(i.medianRebate)}` : ""}`;
}
