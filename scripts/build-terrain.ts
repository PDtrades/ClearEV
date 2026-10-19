/**
 * Builds the realistic layers for the 3D map, all drawn in ClearEV's Albers-composite "pseudo lon/lat" space:
 *  - public/geo/terrain/{z}/{x}/{y}.png  elevation tiles (Terrarium encoding) for MapLibre terrain,
 *    hillshade and color relief. Source: AWS Terrain Tiles (Mapzen/Tilezen Joerd; USGS 3DEP, SRTM,
 *    ETOPO1 and others), resampled from real lon/lat into the composite and masked to US land.
 *  - public/geo/lakes.json  lakes from Natural Earth 10m (public domain), projected the same way.
 *  - public/geo/ranges.json mountain range labels from Natural Earth geography regions.
 * Downloads are cached in .data/terrain-src and .data/ne. Run: npx tsx scripts/build-terrain.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import { ALBERS_HEIGHT, ALBERS_WIDTH, albers, albersToPseudo } from "../src/lib/geo/projection";

const root = process.cwd();
const CACHE = path.join(root, ".data/terrain-src");
const NE = path.join(root, ".data/ne");
const OUT = path.join(root, "public/geo/terrain");
const SPAN = 40 / ALBERS_WIDTH; // pseudo degrees per Albers pixel
const MIN_Z = 2;
const MAX_Z = 6;
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(NE, { recursive: true });

function curl(url: string, file: string) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return;
  execFileSync("curl", ["-sSf", "--retry", "3", "-o", file, url]);
}

// ---------- Source elevation (Terrarium tiles, real lon/lat) ----------
type SrcTile = { data: Buffer; w: number };
const srcTiles = new Map<string, SrcTile | null>();
const lon2x = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
const lat2y = (lat: number, z: number) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z;

async function loadSrc(z: number, x: number, y: number): Promise<SrcTile | null> {
  const key = `${z}/${x}/${y}`;
  if (srcTiles.has(key)) return srcTiles.get(key)!;
  const file = path.join(CACHE, `${z}-${x}-${y}.png`);
  try {
    curl(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`, file);
    const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const t = { data, w: info.width };
    srcTiles.set(key, t);
    return t;
  } catch {
    srcTiles.set(key, null);
    return null;
  }
}

function srcZoom(lon: number, lat: number) {
  if (lat < 23.5 && lon < -150) return 8; // Hawaii (drawn larger than life in the inset)
  if (lat > 50 && lon < -129) return 4; // Alaska (drawn at ~35% scale)
  return 6;
}

async function elevation(lon: number, lat: number): Promise<number> {
  const z = srcZoom(lon, lat);
  const fx = lon2x(lon, z) * 256 - 0.5;
  const fy = lat2y(lat, z) * 256 - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  let acc = 0;
  for (const [dx, dy, w] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]] as const) {
    const px = x0 + dx;
    const py = y0 + dy;
    const t = await loadSrc(z, Math.floor(px / 256), Math.floor(py / 256));
    if (!t) continue;
    const i = ((py & 255) * t.w + (px & 255)) * 3;
    acc += w * (t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768);
  }
  return acc;
}

// ---------- US land mask in pseudo space (scanline fill of the drawn state polygons) ----------
const states = JSON.parse(fs.readFileSync(path.join(root, "public/geo/states.json"), "utf8")) as FeatureCollection<MultiPolygon>;
const MRES = 0.01; // pseudo degrees per mask cell
const MX0 = -21;
const MY0 = -14;
const MW = Math.ceil(42 / MRES);
const MH = Math.ceil(28 / MRES);
const mask = new Uint8Array(MW * MH);
for (const f of states.features) {
  for (const poly of f.geometry.coordinates) {
    const rows = new Map<number, number[]>();
    for (const ring of poly) {
      for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        const r1 = (y1 - MY0) / MRES;
        const r2 = (y2 - MY0) / MRES;
        const lo = Math.ceil(Math.min(r1, r2) - 0.5);
        const hi = Math.floor(Math.max(r1, r2) - 0.5);
        for (let r = lo; r <= hi; r++) {
          const yc = r + 0.5;
          if ((yc < r1) === (yc < r2)) continue;
          const x = x1 + ((yc - r1) / (r2 - r1)) * (x2 - x1);
          (rows.get(r) ?? rows.set(r, []).get(r)!).push((x - MX0) / MRES);
        }
      }
    }
    for (const [r, xs] of rows) {
      if (r < 0 || r >= MH) continue;
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let c = Math.max(0, Math.ceil(xs[k] - 0.5)); c <= Math.min(MW - 1, Math.floor(xs[k + 1] - 0.5)); c++) mask[r * MW + c] = 1;
      }
    }
  }
}
const onLand = (plon: number, plat: number) => {
  const c = Math.floor((plon - MX0) / MRES);
  const r = Math.floor((plat - MY0) / MRES);
  return c >= 0 && r >= 0 && c < MW && r < MH && mask[r * MW + c] === 1;
};
const nearLand = (plon: number, plat: number, cells: number) => {
  const c0 = Math.floor((plon - MX0) / MRES);
  const r0 = Math.floor((plat - MY0) / MRES);
  for (let r = r0 - cells; r <= r0 + cells; r += 2) for (let c = c0 - cells; c <= c0 + cells; c += 2) if (r >= 0 && c >= 0 && r < MH && c < MW && mask[r * MW + c]) return true;
  return false;
};
const pseudoToAlbers = (plon: number, plat: number): [number, number] => [plon / SPAN + ALBERS_WIDTH / 2, -plat / SPAN + ALBERS_HEIGHT / 2];

// ---------- Output DEM tiles in pseudo space ----------
const bounds = states.features.reduce(
  (b, f) => {
    for (const p of f.geometry.coordinates) for (const r of p) for (const [x, y] of r) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
    return b;
  },
  [Infinity, Infinity, -Infinity, -Infinity],
);
const tile2lon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const tile2lat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

async function buildTiles() {
  fs.rmSync(OUT, { recursive: true, force: true });
  let count = 0;
  let maxH = 0;
  for (let z = MIN_Z; z <= MAX_Z; z++) {
    const xA = Math.floor(lon2x(bounds[0], z));
    const xB = Math.floor(lon2x(bounds[2], z));
    const yA = Math.floor(lat2y(bounds[3], z));
    const yB = Math.floor(lat2y(bounds[1], z));
    for (let tx = xA; tx <= xB; tx++) {
      for (let ty = yA; ty <= yB; ty++) {
        const buf = Buffer.alloc(256 * 256 * 3);
        for (let py = 0; py < 256; py++) {
          const plat = tile2lat(ty + (py + 0.5) / 256, z);
          for (let px = 0; px < 256; px++) {
            const plon = tile2lon(tx + (px + 0.5) / 256, z);
            let h = -120; // sea level shelf outside US land, so coastlines read clearly
            if (onLand(plon, plat)) {
              const ll = albers.invert!(pseudoToAlbers(plon, plat));
              h = ll ? Math.max(-90, await elevation(ll[0], ll[1])) : 0;
              if (h > maxH) maxH = h;
            }
            const v = h + 32768;
            const i = (py * 256 + px) * 3;
            buf[i] = Math.floor(v / 256);
            buf[i + 1] = Math.floor(v) % 256;
            buf[i + 2] = Math.floor((v - Math.floor(v)) * 256);
          }
        }
        const dir = path.join(OUT, String(z), String(tx));
        fs.mkdirSync(dir, { recursive: true });
        await sharp(buf, { raw: { width: 256, height: 256, channels: 3 } }).png({ compressionLevel: 9 }).toFile(path.join(dir, `${ty}.png`));
        count++;
      }
    }
    console.log(`z${z}: done (${count} tiles so far)`);
  }
  fs.writeFileSync(
    path.join(OUT, "meta.json"),
    JSON.stringify({ minzoom: MIN_Z, maxzoom: MAX_Z, bounds, encoding: "terrarium", maxElevation: Math.round(maxH), attribution: "Elevation: AWS Terrain Tiles (Mapzen/Tilezen: USGS 3DEP, SRTM, ETOPO1 and others)" }),
  );
  console.log(`terrain: ${count} tiles, max elevation ${Math.round(maxH)} m`);
}

// ---------- Lakes ----------
function projectRing(ring: Position[]): Position[] {
  const out: Position[] = [];
  for (const [lon, lat] of ring) {
    const p = albers([lon, lat]);
    if (p) out.push(albersToPseudo(p as [number, number]));
  }
  return out;
}

function buildLakes() {
  curl("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_lakes.geojson", path.join(NE, "ne_10m_lakes.geojson"));
  curl("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_lakes_north_america.geojson", path.join(NE, "ne_10m_lakes_north_america.geojson"));
  const features: Feature<Polygon | MultiPolygon, { name: string }>[] = [];
  const seen = new Set<string>();
  for (const file of ["ne_10m_lakes.geojson", "ne_10m_lakes_north_america.geojson"]) {
    const fc = JSON.parse(fs.readFileSync(path.join(NE, file), "utf8")) as FeatureCollection<Polygon | MultiPolygon, Record<string, unknown>>;
    for (const f of fc.features) {
      if (!f.geometry) continue;
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      // Real-world filter: only lakes in or touching the US (by bounding box), then the land-mask test below.
      let minLat = 90;
      let maxLat = -90;
      let minLon = 180;
      let maxLon = -180;
      for (const p of polys) for (const [lon, lat] of p[0]) {
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
      }
      const inLower48 = maxLon > -125 && minLon < -66 && minLat < 49.5 && maxLat > 24;
      const inAK = minLon < -129 && maxLat > 51 && minLat < 72;
      const inHI = minLon > -161 && maxLon < -154 && maxLat < 23;
      if (!inLower48 && !inAK && !inHI) continue;
      const projected = polys.map((p) => p.map(projectRing).filter((r) => r.length >= 4)).filter((p) => p.length);
      if (!projected.length) continue;
      let near = 0;
      let total = 0;
      for (const p of projected) for (const [x, y] of p[0]) {
        total++;
        if (nearLand(x, y, 6)) near++;
      }
      if (!total || near / total < 0.25) continue;
      const name = String(f.properties.name ?? "");
      const key = `${name}|${Math.round(minLon * 10)}|${Math.round(minLat * 10)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const round = (r: Position[]) => r.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]);
      features.push({ type: "Feature", properties: { name }, geometry: { type: "MultiPolygon", coordinates: projected.map((p) => p.map(round)) } });
    }
  }
  fs.writeFileSync(path.join(root, "public/geo/lakes.json"), JSON.stringify({ type: "FeatureCollection", features }));
  console.log(`lakes: ${features.length}`);
}

// ---------- Mountain range labels ----------
function buildRanges() {
  curl("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_geography_regions_polys.geojson", path.join(NE, "ne_10m_geography_regions_polys.geojson"));
  const fc = JSON.parse(fs.readFileSync(path.join(NE, "ne_10m_geography_regions_polys.geojson"), "utf8")) as FeatureCollection<Polygon | MultiPolygon, Record<string, unknown>>;
  const out: { name: string; scalerank: number; lng: number; lat: number }[] = [];
  for (const f of fc.features) {
    if (f.properties.FEATURECLA !== "Range/mtn" || f.properties.REGION !== "North America" || !f.geometry) continue;
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const pts: Position[] = [];
    for (const p of polys) {
      const ring = p[0];
      // Sample the outline plus interior points along the ring's bounding box to find US land inside the range.
      let [a, b, c, d] = [180, 90, -180, -90];
      for (const [lon, lat] of ring) [a, b, c, d] = [Math.min(a, lon), Math.min(b, lat), Math.max(c, lon), Math.max(d, lat)];
      for (let i = 0; i <= 24; i++) for (let j = 0; j <= 24; j++) {
        const lon = a + ((c - a) * i) / 24;
        const lat = b + ((d - b) * j) / 24;
        if (!pointInRing([lon, lat], ring)) continue;
        const pp = albers([lon, lat]);
        if (!pp) continue;
        const ps = albersToPseudo(pp as [number, number]);
        if (onLand(ps[0], ps[1])) pts.push(ps);
      }
    }
    if (pts.length < 4) continue;
    if (/kootenay|^coast mountains$/i.test(String(f.properties.NAME))) continue; // Canadian ranges that only clip the border
    pts.sort((p, q) => p[0] - q[0]);
    const mx = pts[Math.floor(pts.length / 2)][0];
    const ys = pts.map((p) => p[1]).sort((p, q) => p - q);
    const my = ys[Math.floor(ys.length / 2)];
    const name = String(f.properties.NAME_EN ?? f.properties.NAME).replace(/\bMts\.?/i, "Mountains").replace(/\s+/g, " ");
    out.push({ name: titleCase(name).replace("Pacific Coast Ranges", "Coast Ranges"), scalerank: Number(f.properties.SCALERANK ?? 9), lng: Math.round(mx * 1e4) / 1e4, lat: Math.round(my * 1e4) / 1e4 });
  }
  out.sort((a, b) => a.scalerank - b.scalerank);
  fs.writeFileSync(path.join(root, "public/geo/ranges.json"), JSON.stringify(out));
  console.log(`ranges: ${out.map((r) => r.name).join(", ")}`);
}

function pointInRing([x, y]: Position, ring: Position[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function titleCase(s: string) {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

buildLakes();
buildRanges();
buildTiles().catch((e) => {
  console.error(e);
  process.exit(1);
});
