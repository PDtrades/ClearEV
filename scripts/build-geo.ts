/**
 * Builds ClearEV's static geography files from public-domain US Census data.
 *
 * Inputs (all US Government works, public domain):
 *  - ZCTA internal points: 2025 Census ZCTA Gazetteer, as packaged in the `us-zip-centroids` npm
 *    module (GEOID, INTPTLAT, INTPTLONG rounded to 4 decimals). Pass --gazetteer <file> to use an
 *    official Gazetteer text file downloaded from census.gov instead.
 *  - ZCTA to county relationships: 2010 Census ZCTA-county relationship file, as packaged in
 *    `us-zcta-counties`. Used for overlapping counties/states. Pass --rel <file> for an official file.
 *  - State and county boundaries: Census cartographic boundary files, as packaged in `us-atlas`.
 *
 * Outputs:
 *  - data/geo/zcta.json      ZIP -> [lat, lng, state, primaryCountyFips, otherCountyFips[]]
 *  - data/geo/counties.json  county FIPS -> name
 *  - public/geo/states.json  state polygons in ClearEV's Albers-composite drawing space (GeoJSON)
 *  - public/geo/state-paths.json  SVG path strings for the no-WebGL fallback map
 */
import fs from "node:fs";
import path from "node:path";
import { feature } from "topojson-client";
import { geoContains, geoPath, geoCentroid, geoBounds } from "d3-geo";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import { STATES, stateByFips } from "../src/lib/geo/states";
import { albers, albersToPseudo } from "../src/lib/geo/projection";

const root = path.resolve(__dirname, "..");
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};

type Topo = Parameters<typeof feature>[0];
const statesTopo = JSON.parse(fs.readFileSync(require.resolve("us-atlas/states-10m.json"), "utf8")) as Topo & {
  objects: Record<string, unknown>;
};
const countiesTopo = JSON.parse(fs.readFileSync(require.resolve("us-atlas/counties-10m.json"), "utf8")) as Topo & {
  objects: Record<string, unknown>;
};
const states = feature(statesTopo, statesTopo.objects.states as never) as unknown as FeatureCollection<Geometry, { name: string }>;
const counties = feature(countiesTopo, countiesTopo.objects.counties as never) as unknown as FeatureCollection<Geometry, { name: string }>;

type Indexed = { f: Feature<Geometry, { name: string }>; id: string; bbox: [[number, number], [number, number]] };
const index = (fc: FeatureCollection<Geometry, { name: string }>): Indexed[] =>
  fc.features.map((f) => ({ f, id: String(f.id), bbox: geoBounds(f) as [[number, number], [number, number]] }));
const stateIdx = index(states);
const countyIdx = index(counties);

function inBbox(b: Indexed["bbox"], lon: number, lat: number) {
  const [[x0, y0], [x1, y1]] = b;
  // Features crossing the antimeridian (Alaska) have x0 > x1.
  const lonOk = x0 <= x1 ? lon >= x0 && lon <= x1 : lon >= x0 || lon <= x1;
  return lonOk && lat >= y0 && lat <= y1;
}
function locate(idx: Indexed[], lon: number, lat: number): string | null {
  for (const it of idx) if (inBbox(it.bbox, lon, lat) && geoContains(it.f, [lon, lat])) return it.id;
  return null;
}
function nearest(idx: Indexed[], lon: number, lat: number): string {
  let best = idx[0].id;
  let bestD = Infinity;
  for (const it of idx) {
    const [cx, cy] = geoCentroid(it.f);
    const d = (cx - lon) ** 2 + (cy - lat) ** 2;
    if (d < bestD) [best, bestD] = [it.id, d];
  }
  return best;
}

// ---- ZCTA points
function readPoints(): { source: string; rows: [string, number, number][] } {
  const gaz = arg("--gazetteer");
  if (gaz) {
    const lines = fs.readFileSync(gaz, "utf8").trim().split(/\r?\n/);
    const head = lines[0].split("\t").map((h) => h.trim());
    const [gi, la, lo] = ["GEOID", "INTPTLAT", "INTPTLONG"].map((h) => head.indexOf(h));
    return {
      source: `Census ZCTA Gazetteer file ${path.basename(gaz)}`,
      rows: lines.slice(1).map((l) => {
        const c = l.split("\t");
        return [c[gi].trim(), Number(c[la]), Number(c[lo])];
      }),
    };
  }
  const csv = fs.readFileSync(path.join(path.dirname(require.resolve("us-zip-centroids/package.json")), "data/zip_centroids.csv"), "utf8");
  return {
    source: "2025 Census ZCTA Gazetteer (via us-zip-centroids@1.2.0 data/zip_centroids.csv)",
    rows: csv
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((l) => {
        const [z, la, lo] = l.split(",");
        return [z, Number(la), Number(lo)];
      }),
  };
}

// ---- ZCTA->county relationships (for overlap information)
function readRelationships(): { source: string; map: Map<string, { state: string; county: string }[]> } {
  const map = new Map<string, { state: string; county: string }[]>();
  const rel = arg("--rel");
  if (rel) {
    const lines = fs.readFileSync(rel, "utf8").trim().split(/\r?\n/);
    const head = lines[0].split(/[|,]/);
    const sep = lines[0].includes("|") ? "|" : ",";
    const zi = head.findIndex((h) => /GEOID_ZCTA5|ZCTA5/.test(h));
    const ci = head.findIndex((h) => /GEOID_COUNTY|^GEOID$/.test(h));
    for (const l of lines.slice(1)) {
      const c = l.split(sep);
      const county = c[ci];
      if (!c[zi] || !county) continue;
      const st = stateByFips(county.slice(0, 2));
      if (!st) continue;
      const list = map.get(c[zi]) ?? [];
      list.push({ state: st.abbr, county });
      map.set(c[zi], list);
    }
    return { source: `Census ZCTA-county relationship file ${path.basename(rel)}`, map };
  }
  // us-zcta-counties stores county names, not FIPS; resolve names within the state.
  const data = JSON.parse(
    fs.readFileSync(path.join(path.dirname(require.resolve("us-zcta-counties/package.json")), "zip_state_county.json"), "utf8"),
  ) as { zip_state_county: [string, string, string][] };
  const nameToFips = new Map<string, string>();
  for (const c of countyIdx) {
    const st = stateByFips(c.id.slice(0, 2));
    if (st) nameToFips.set(`${st.abbr}|${normalizeCounty(c.f.properties.name)}`, c.id);
  }
  for (const [zip, st, county] of data.zip_state_county) {
    const fips = nameToFips.get(`${st}|${normalizeCounty(county)}`);
    const list = map.get(zip) ?? [];
    if (fips) list.push({ state: st, county: fips });
    else list.push({ state: st, county: "" });
    map.set(zip, list);
  }
  return { source: "2010 Census ZCTA-county relationship file (via us-zcta-counties@0.0.2)", map };
}
function normalizeCounty(n: string) {
  return n
    .toLowerCase()
    .replace(/ (county|parish|borough|census area|city and borough|municipality|municipio)$/g, "")
    .replace(/[^a-z]/g, "");
}

const points = readPoints();
const rels = readRelationships();
const out: Record<string, [number, number, string, string, string[]]> = {};
const stats = { total: 0, fromRelationship: 0, fromPolygon: 0, fromNearest: 0, multiState: 0, unsupported: 0 };

for (const [zip, lat, lng] of points.rows) {
  if (!/^\d{5}$/.test(zip) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  stats.total++;
  const rel = rels.map.get(zip) ?? [];
  const relStates = [...new Set(rel.map((r) => r.state))];
  const polyState = locate(stateIdx, lng, lat);
  let state: string;
  if (polyState && stateByFips(polyState)) {
    state = stateByFips(polyState)!.abbr;
    stats.fromPolygon++;
  } else if (relStates.length === 1) {
    state = relStates[0];
    stats.fromRelationship++;
  } else {
    state = stateByFips(nearest(stateIdx, lng, lat))!.abbr;
    stats.fromNearest++;
  }
  if (!STATES.find((s) => s.abbr === state)?.supported) stats.unsupported++;
  const county = locate(countyIdx, lng, lat) ?? rel.find((r) => r.state === state && r.county)?.county ?? "";
  const others = [...new Set(rel.map((r) => r.county).filter((c) => c && c !== county))];
  if (others.some((c) => stateByFips(c.slice(0, 2))?.abbr !== state)) stats.multiState++;
  out[zip] = [lat, lng, state, county, others];
}

const countyNames: Record<string, string> = {};
for (const c of countyIdx) countyNames[c.id] = c.f.properties.name;

fs.mkdirSync(path.join(root, "data/geo"), { recursive: true });
fs.writeFileSync(
  path.join(root, "data/geo/zcta.json"),
  JSON.stringify({
    meta: {
      generatedAt: new Date().toISOString(),
      pointsSource: points.source,
      relationshipSource: rels.source,
      boundarySource: "Census cartographic boundary files via us-atlas@3.0.1 (states-10m, counties-10m)",
      method:
        "State and primary county = Census boundary polygon containing the ZCTA internal point; relationship file used when the point falls outside simplified polygons; nearest state as last resort. Other counties come from the relationship file.",
      license: "US Government works, public domain",
      caveat: "ZCTAs approximate USPS ZIP codes. PO-box-only and single-organization ZIPs may be missing.",
      stats,
    },
    zips: out,
  }),
);
fs.writeFileSync(path.join(root, "data/geo/counties.json"), JSON.stringify(countyNames));

// ---- Drawing geometry for the map (Albers composite, pseudo lon/lat) and SVG fallback paths
const supported = states.features.filter((f) => stateByFips(String(f.id))?.supported);
const projectRing = (ring: Position[]) => {
  const res: Position[] = [];
  for (const p of ring) {
    const xy = albers(p as [number, number]);
    if (xy) res.push(albersToPseudo(xy as [number, number]));
  }
  return res;
};
const drawn: FeatureCollection = {
  type: "FeatureCollection",
  features: supported.map((f) => {
    const st = stateByFips(String(f.id))!;
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    const coords = polys.map((poly) => poly.map(projectRing).filter((r) => r.length >= 4)).filter((p) => p.length);
    const c = albers(geoCentroid(f) as [number, number]);
    return {
      type: "Feature",
      id: Number(st.fips),
      properties: { abbr: st.abbr, name: st.name, fips: st.fips, labelLng: c ? albersToPseudo(c as [number, number])[0] : 0, labelLat: c ? albersToPseudo(c as [number, number])[1] : 0 },
      geometry: { type: "MultiPolygon", coordinates: coords },
    };
  }),
};
fs.mkdirSync(path.join(root, "public/geo"), { recursive: true });
fs.writeFileSync(path.join(root, "public/geo/states.json"), JSON.stringify(drawn));

const svgPath = geoPath(albers).digits(1);
const paths: Record<string, { d: string; name: string; cx: number; cy: number }> = {};
for (const f of supported) {
  const st = stateByFips(String(f.id))!;
  const [cx, cy] = svgPath.centroid(f);
  paths[st.abbr] = { d: svgPath(f) ?? "", name: st.name, cx: Math.round(cx), cy: Math.round(cy) };
}
fs.writeFileSync(path.join(root, "public/geo/state-paths.json"), JSON.stringify(paths));

console.log("ZCTA build stats", stats);
