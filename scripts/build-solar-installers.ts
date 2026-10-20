/**
 * Writes public/geo/solar-installers.json: which companies installed home solar in each county and state,
 * from Lawrence Berkeley National Laboratory's Tracking the Sun public data file (2024 release,
 * Open Energy Data Initiative copy, CC BY 3.0 US). Every number is a count, date or median of values
 * the file states per system; nothing is estimated. Download the per-state parquet files first:
 *
 *   aws s3 cp --no-sign-request --recursive s3://oedi-data-lake/tracking-the-sun/2024/ <dir>
 *   (or list https://oedi-data-lake.s3.amazonaws.com/?list-type=2&prefix=tracking-the-sun/2024/ and curl each key)
 *
 * then run: npx tsx scripts/build-solar-installers.ts <dir>
 * Files may sit in state=XX/ folders (as on S3) or be named XX.parquet.
 */
import fs from "node:fs";
import path from "node:path";
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet";
import { stateByAbbr } from "../src/lib/geo/states";
import type { InstallerEntry, SolarInstallerData, StateInstallers } from "../src/lib/solar/installers";

const dir = process.argv[2];
if (!dir) throw new Error("usage: build-solar-installers.ts <dir with Tracking the Sun parquet files>");

const RELEASE = "2024";
// The release was published 2025-02-28; later dates in the file are data-entry errors.
const WINDOW = { from: "2021-01-01", to: "2025-02-28" };
const MIN_COUNTY_SYSTEMS = 3;
const TOP_COUNTY = 8;
const TOP_STATE = 10;
// Placeholders the file uses instead of a company name.
const NOT_A_NAME = /^(-1|redacted|self|unknown|n\/?a|none|homeowner|owner|other)$/i;

const zcta: { zips: Record<string, [number, number, string, string, string[]]> } = JSON.parse(fs.readFileSync("data/geo/zcta.json", "utf8"));

const COLUMNS = ["installation_date", "customer_segment", "installer_name", "self_installed", "zip_code", "rebate_or_grant", "total_installed_price", "pv_system_size_dc", "third_party_owned", "data_provider_1"];
type Row = { installation_date: Date | null; customer_segment: string; installer_name: string; self_installed: number; zip_code: string; rebate_or_grant: number; total_installed_price: number; pv_system_size_dc: number; third_party_owned: number; data_provider_1: string };

interface Acc { systems: number; last: string; rebates: number[]; rebateKnown: number; tpo: number; tpoKnown: number; ppw: number[] }
const newAcc = (): Acc => ({ systems: 0, last: "", rebates: [], rebateKnown: 0, tpo: 0, tpoKnown: 0, ppw: [] });

function add(acc: Acc, r: Row, ym: string) {
  acc.systems++;
  if (ym > acc.last) acc.last = ym;
  if (r.rebate_or_grant >= 0) {
    acc.rebateKnown++;
    if (r.rebate_or_grant > 0) acc.rebates.push(r.rebate_or_grant);
  }
  if (r.third_party_owned === 0 || r.third_party_owned === 1) {
    acc.tpoKnown++;
    acc.tpo += r.third_party_owned;
  }
  // LBNL leaves leased and PPA systems out of its price analysis: their reported prices are often appraisals.
  if (r.third_party_owned === 0 && r.total_installed_price > 0 && r.pv_system_size_dc > 0) acc.ppw.push(r.total_installed_price / (r.pv_system_size_dc * 1000));
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function zip5(z: string | null): string | null {
  const m = /^(\d{4,5})(-\d{4})?$/.exec((z ?? "").trim());
  return m ? m[1].padStart(5, "0") : null;
}

const files = fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith(".parquet"));
const names: string[] = [];
const nameIdx = new Map<string, number>();
const idx = (n: string) => {
  let i = nameIdx.get(n);
  if (i === undefined) nameIdx.set(n, (i = names.push(n) - 1));
  return i;
};

const states: Record<string, StateInstallers> = {};
const withoutNames: Record<string, string> = {};

async function main() {
  for (const f of files.sort()) {
    const abbr = /state=([A-Z]{2})/.exec(f)?.[1] ?? /^([A-Z]{2})\.parquet$/.exec(path.basename(f))?.[1];
    if (!abbr || !stateByAbbr(abbr)) continue;
    const rows = (await parquetReadObjects({ file: await asyncBufferFromFile(path.join(dir, f)), columns: COLUMNS })) as Row[];
    const stateAcc = new Map<string, Acc>();
    const countyAcc = new Map<string, Map<string, Acc>>();
    const reporters = new Map<string, number>();
    let recent = 0;
    let dataThrough = "";
    for (const r of rows) {
      if (!r.installation_date || r.customer_segment !== "RES" || r.self_installed === 1) continue;
      const day = r.installation_date.toISOString().slice(0, 10);
      if (day < WINDOW.from || day > WINDOW.to) continue;
      recent++;
      const ym = day.slice(0, 7);
      if (ym > dataThrough) dataThrough = ym;
      const name = (r.installer_name ?? "").trim();
      if (!name || NOT_A_NAME.test(name)) continue;
      if (!stateAcc.has(name)) stateAcc.set(name, newAcc());
      add(stateAcc.get(name)!, r, ym);
      if (r.rebate_or_grant > 0) reporters.set(r.data_provider_1, (reporters.get(r.data_provider_1) ?? 0) + 1);
      const z = zip5(r.zip_code);
      const row = z ? zcta.zips[z] : undefined;
      // Only ZIPs the Census places in this state; the file has a few out-of-state mailing ZIPs.
      if (!row || row[2] !== abbr) continue;
      const fips = row[3];
      if (!countyAcc.has(fips)) countyAcc.set(fips, new Map());
      const c = countyAcc.get(fips)!;
      if (!c.has(name)) c.set(name, newAcc());
      add(c.get(name)!, r, ym);
    }
    if (!stateAcc.size) {
      withoutNames[abbr] = recent ? "installer names are withheld or missing in this state's records" : "no home systems installed since 2021 in this state's records";
      continue;
    }
    const entry = (name: string, a: Acc): InstallerEntry => {
      const rb = median(a.rebates);
      const pw = a.ppw.length >= 5 ? median(a.ppw) : null;
      return [idx(name), a.systems, a.last, a.rebateKnown, a.rebates.length, rb === null ? null : Math.round(rb), a.tpoKnown, a.tpo, pw === null ? null : Math.round(pw * 100) / 100];
    };
    const top = (m: Map<string, Acc>, n: number, min: number) =>
      [...m].filter(([, a]) => a.systems >= min).sort((a, b) => b[1].systems - a[1].systems || a[0].localeCompare(b[0])).slice(0, n).map(([nm, a]) => entry(nm, a));
    const counties: Record<string, InstallerEntry[]> = {};
    for (const [fips, m] of [...countyAcc].sort()) {
      const t = top(m, TOP_COUNTY, MIN_COUNTY_SYSTEMS);
      if (t.length) counties[fips] = t;
    }
    states[abbr] = {
      dataThrough,
      systems: [...stateAcc.values()].reduce((s, a) => s + a.systems, 0),
      installers: stateAcc.size,
      rebateReportedBy: [...reporters].sort((a, b) => b[1] - a[1]).map(([n]) => n),
      top: top(stateAcc, TOP_STATE, 1),
      counties,
    };
    console.log(`${abbr}: ${states[abbr].systems} systems, ${stateAcc.size} installers, ${Object.keys(counties).length} counties`);
  }

  const out: SolarInstallerData = {
    meta: {
      source: "Lawrence Berkeley National Laboratory, Tracking the Sun public data file",
      release: RELEASE,
      homepage: "https://emp.lbl.gov/tracking-the-sun",
      dataUrl: `https://oedi-data-lake.s3.amazonaws.com/?list-type=2&prefix=tracking-the-sun/${RELEASE}/`,
      license: "Creative Commons Attribution 3.0 United States (Open Energy Data Initiative data lake)",
      licenseUrl: "https://registry.opendata.aws/oedi-data-lake/",
      builtAt: new Date().toISOString(),
      window: WINDOW,
      method: `Home (RES) systems installed ${WINDOW.from} to ${WINDOW.to}, excluding self-installs and records without a company name. ZIP codes are placed in counties with ClearEV's Census ZIP file. Counties list up to ${TOP_COUNTY} companies with at least ${MIN_COUNTY_SYSTEMS} systems; states list the top ${TOP_STATE}. Medians use only systems where the file states the value; price per watt uses home-owned (not leased or PPA) systems, before incentives, and needs at least 5 of them.`,
    },
    names,
    states,
    withoutNames,
  };
  fs.writeFileSync("public/geo/solar-installers.json", JSON.stringify(out));
  console.log(`installers: ${Object.keys(states).length} states, ${names.length} names, ${(fs.statSync("public/geo/solar-installers.json").size / 1024).toFixed(0)} KB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
