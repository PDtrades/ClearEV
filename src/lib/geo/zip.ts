import fs from "node:fs";
import path from "node:path";
import { stateByAbbr } from "./states";
import { normalizeZip } from "./zip-format";

export { normalizeZip };

export interface ZipInfo {
  zip: string;
  lat: number;
  lng: number;
  state: string;
  countyFips: string;
  countyName?: string;
  otherCountyFips: string[];
  supported: boolean;
}

type ZctaFile = { meta: Record<string, unknown>; zips: Record<string, [number, number, string, string, string[]]> };

let cache: { zcta: ZctaFile; counties: Record<string, string> } | null = null;
function load() {
  if (!cache) {
    const dir = process.env.CLEAREV_GEO_DIR ?? path.join(process.cwd(), "data/geo");
    cache = {
      zcta: JSON.parse(fs.readFileSync(path.join(dir, "zcta.json"), "utf8")),
      counties: JSON.parse(fs.readFileSync(path.join(dir, "counties.json"), "utf8")),
    };
  }
  return cache;
}


export function lookupZip(input: string | null | undefined): ZipInfo | null {
  const zip = normalizeZip(input);
  if (!zip) return null;
  const { zcta, counties } = load();
  const row = zcta.zips[zip];
  if (!row) return null;
  const [lat, lng, state, countyFips, others] = row;
  return { zip, lat, lng, state, countyFips, countyName: counties[countyFips], otherCountyFips: others, supported: !!stateByAbbr(state)?.supported };
}

export function countyName(fips: string): string | undefined {
  return load().counties[fips];
}

export function geoMeta() {
  return load().zcta.meta;
}
