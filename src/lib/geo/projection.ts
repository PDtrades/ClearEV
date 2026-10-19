import { geoAlbersUsa } from "d3-geo";

/**
 * ClearEV draws the US as an Albers USA composite (Alaska and Hawaii as insets) so all 50 states
 * and DC are usable at once. MapLibre expects lon/lat, so projected Albers pixels are mapped
 * linearly into a small lon/lat window around the equator, where Web Mercator is close to linear.
 * The resulting "pseudo lon/lat" is only for drawing; never use it as real geography.
 */
export const ALBERS_WIDTH = 975;
export const ALBERS_HEIGHT = 610;
const SPAN_DEGREES = 40;

export const albers = geoAlbersUsa().scale(1300).translate([ALBERS_WIDTH / 2, ALBERS_HEIGHT / 2]);

export function albersToPseudo([x, y]: [number, number]): [number, number] {
  const k = SPAN_DEGREES / ALBERS_WIDTH;
  return [round((x - ALBERS_WIDTH / 2) * k), round(-(y - ALBERS_HEIGHT / 2) * k)];
}

/** Real lon/lat to pseudo lon/lat; null when outside the composite (e.g. territories). */
export function lonLatToPseudo(lon: number, lat: number): [number, number] | null {
  const p = albers([lon, lat]);
  return p ? albersToPseudo(p as [number, number]) : null;
}

export const PSEUDO_BOUNDS: [[number, number], [number, number]] = [
  albersToPseudo([0, ALBERS_HEIGHT]),
  albersToPseudo([ALBERS_WIDTH, 0]),
];

function round(n: number) {
  return Math.round(n * 1e5) / 1e5;
}
