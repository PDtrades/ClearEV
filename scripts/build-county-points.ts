/**
 * Writes public/geo/county-points.json: county FIPS -> [mapLng, mapLat, svgX, svgY], the county's
 * centroid in the 3D map's pseudo lon/lat space and in the SVG fallback's pixel space. Used to place
 * county hotspot markers. Source: Census cartographic boundaries via us-atlas@3.0.1 (counties-10m).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { geoCentroid, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import { albers, albersToPseudo } from "../src/lib/geo/projection";
import { stateByFips } from "../src/lib/geo/states";

const require = createRequire(import.meta.url);
const topo = JSON.parse(fs.readFileSync(require.resolve("us-atlas/counties-10m.json"), "utf8"));
const counties = feature(topo, topo.objects.counties) as unknown as FeatureCollection<Geometry, { name: string }>;
const svgPath = geoPath(albers);
const out: Record<string, [number, number, number, number]> = {};
for (const f of counties.features) {
  const fips = String(f.id).padStart(5, "0");
  if (!stateByFips(fips.slice(0, 2))?.supported) continue;
  const xy = albers(geoCentroid(f) as [number, number]);
  if (!xy) continue;
  const [lng, lat] = albersToPseudo(xy as [number, number]);
  const [sx, sy] = svgPath.centroid(f);
  out[fips] = [Number(lng.toFixed(4)), Number(lat.toFixed(4)), Math.round(sx), Math.round(sy)];
}
fs.writeFileSync(path.join(process.cwd(), "public/geo/county-points.json"), JSON.stringify(out));
console.log(`county points: ${Object.keys(out).length}`);
