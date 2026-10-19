"use client";
import maplibregl, { type Map as MlMap, type MapGeoJSONFeature, type MapMouseEvent, type Marker, type Popup } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { FeatureCollection, MultiPolygon } from "geojson";
import { PSEUDO_BOUNDS } from "@/lib/geo/projection";
import { ICON_LABELS, iconForCategory, type IconKind } from "@/lib/domain/program";
import type { ResultProgram } from "./ResultCard";
import { fmtDollars, metric, rankCountyGroups, rankHotspots, type HotspotData } from "@/lib/search/hotspots";
import { hotspotLabel, hotspotSummary, type HotspotView } from "./HotspotPanel";

export interface UsMapProps {
  stateCounts: Record<string, number>;
  selectedState?: string;
  selectedId?: string;
  zipPoint: [number, number] | null;
  zipLabel?: string;
  /** Programs tied to the searched ZIP (utility/local coverage); drawn as markers at the search point. */
  localPrograms: ResultProgram[];
  onSelectState: (abbr: string | undefined) => void;
  onSelectProgram: (id: string) => void;
  onHoverProgram?: (id: string | undefined) => void;
  hotspots?: HotspotData;
  hotspotMode?: HotspotView;
}

type StateProps = { abbr: string; name: string; fips: string; labelLng: number; labelLat: number };

const ICON_SVG: Record<IconKind, string> = {
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  solar: '<rect x="3" y="4" width="18" height="11" rx="1.5"/><path d="M3 9.5h18M9 4v11M15 4v11M12 15v5M8 20h8"/>',
  battery: '<rect x="2.5" y="7" width="17" height="10" rx="2"/><path d="M22 10.5v3M6 10.5v3M10 10.5v3M14 10.5v3"/>',
  plug: '<path d="M9 3v4M15 3v4M7 7h10v4a5 5 0 0 1-10 0V7zM12 16v5"/>',
  general: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
};
const ICON_COLOR: Record<IconKind, string> = { bolt: "#2563c7", solar: "#a35d00", battery: "#1f8a5b", plug: "#6b4fc2", general: "#4a5a74" };

export function iconSvg(kind: IconKind, size = 16) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${ICON_COLOR[kind]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_SVG[kind]}</svg>`;
}

const SPREAD_ZOOM = 5.2;
const FIT_PADDING = { top: 24, bottom: 36, left: 24, right: 24 };
const HOME_PITCH = 38;

export default function UsMap(props: UsMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const labelsRef = useRef<Marker[]>([]);
  const hotspotMarkersRef = useRef<Marker[]>([]);
  const countyPointsRef = useRef<Record<string, [number, number, number, number]> | null>(null);
  const hoveredRef = useRef<number | null>(null);
  const fcRef = useRef<FeatureCollection<MultiPolygon, StateProps> | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Create the map once.
  useEffect(() => {
    if (!container.current || mapRef.current) return;
    let map: MlMap;
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "rgba(0,0,0,0)" } }] },
        bounds: PSEUDO_BOUNDS,
        fitBoundsOptions: { padding: FIT_PADDING },
        pitch: 0,
        bearing: 0,
        minZoom: 2.5,
        maxZoom: 9,
        maxPitch: 70,
        attributionControl: false,
        dragRotate: true,
        touchPitch: true,
        renderWorldCopies: false,
        canvasContextAttributes: { antialias: true },
      });
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    mapRef.current = map;
    map.on("error", (e) => setError(e.error?.message ?? "Map error"));
    map.on("load", async () => {
      const res = await fetch("/geo/states.json");
      const fc = (await res.json()) as FeatureCollection<MultiPolygon, StateProps>;
      fcRef.current = fc;
      map.addSource("states", { type: "geojson", data: fc });
      map.addLayer({
        id: "states-fill",
        type: "fill-extrusion",
        source: "states",
        paint: {
          "fill-extrusion-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#2563c7",
            ["boolean", ["feature-state", "hover"], false],
            "#9cc0f0",
            [">", ["coalesce", ["feature-state", "heat"], 0], 0],
            ["interpolate", ["linear"], ["feature-state", "heat"], 0, "#fde9cc", 0.5, "#f7b267", 1, "#e8603c"],
            ["interpolate", ["linear"], ["coalesce", ["feature-state", "count"], 0], 0, "#ffffff", 1, "#e8f1fb", 30, "#c6dcf5", 120, "#8fb6e8"],
          ],
          "fill-extrusion-height": ["+", 12000, ["*", 900, ["min", 200, ["coalesce", ["feature-state", "count"], 0]]]],
          "fill-extrusion-opacity": 0.96,
          "fill-extrusion-vertical-gradient": true,
        },
      });
      map.addLayer({ id: "states-line", type: "line", source: "states", paint: { "line-color": "#7fa3c9", "line-width": 0.8 } });

      // State labels as pointer-transparent HTML markers (no external glyph server needed).
      for (const f of fc.features) {
        const el = document.createElement("div");
        el.textContent = f.properties.abbr;
        el.setAttribute("aria-hidden", "true");
        el.style.cssText = "font:600 11px/1 system-ui,sans-serif;color:#2f4262;pointer-events:none;text-shadow:0 0 3px #fff,0 0 3px #fff;";
        labelsRef.current.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([f.properties.labelLng, f.properties.labelLat]).addTo(map));
      }
      // Washington, DC gets an enlarged, clickable target since its polygon is tiny.
      const dc = fc.features.find((f) => f.properties.abbr === "DC");
      if (dc) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "btn btn-sm";
        el.textContent = "DC";
        el.setAttribute("aria-label", "District of Columbia");
        el.style.cssText = "font-weight:700;padding:3px 8px;border-radius:999px;";
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          propsRef.current.onSelectState("DC");
        });
        labelsRef.current.push(new maplibregl.Marker({ element: el, anchor: "left", offset: [14, 6] }).setLngLat([dc.properties.labelLng, dc.properties.labelLat]).addTo(map));
      }

      popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: "map-popup" });
      map.on("mousemove", "states-fill", (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
        const f = e.features?.[0] as (MapGeoJSONFeature & { properties: StateProps }) | undefined;
        if (!f || f.id == null) return;
        map.getCanvas().style.cursor = "pointer";
        if (hoveredRef.current !== null && hoveredRef.current !== f.id) map.setFeatureState({ source: "states", id: hoveredRef.current }, { hover: false });
        hoveredRef.current = Number(f.id);
        map.setFeatureState({ source: "states", id: f.id }, { hover: true });
        const n = propsRef.current.stateCounts[f.properties.abbr] ?? 0;
        const hs = propsRef.current.hotspotMode !== "off" ? propsRef.current.hotspots?.states.find((h) => h.state === f.properties.abbr) : undefined;
        const extra = hs?.top ? `<br>Largest stated amount: ${fmtDollars(hs.top.value)} (${escapeHtml(hs.top.programName)})` : "";
        popupRef.current!.setLngLat(e.lngLat).setHTML(`<strong>${f.properties.name}</strong><br>${n} state, utility or local program${n === 1 ? "" : "s"} listed · nationwide programs also apply${extra}`).addTo(map);
      });
      map.on("mouseleave", "states-fill", () => {
        map.getCanvas().style.cursor = "";
        if (hoveredRef.current !== null) map.setFeatureState({ source: "states", id: hoveredRef.current }, { hover: false });
        hoveredRef.current = null;
        popupRef.current?.remove();
      });
      map.on("click", "states-fill", (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
        const f = e.features?.[0] as (MapGeoJSONFeature & { properties: StateProps }) | undefined;
        if (f) propsRef.current.onSelectState(f.properties.abbr);
      });
      map.on("zoomend", () => setZoom(map.getZoom()));
      map.fitBounds(PSEUDO_BOUNDS, { padding: FIT_PADDING, pitch: HOME_PITCH, duration: prefersReduced() ? 0 : 800 });
      setReady(true);
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Counts + selection into feature state.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const fc = fcRef.current;
    if (!fc || !map.getSource("states")) return;
    for (const f of fc.features) {
      map.setFeatureState({ source: "states", id: f.id as number }, { count: props.stateCounts[f.properties.abbr] ?? 0, selected: props.selectedState === f.properties.abbr });
    }
  }, [ready, props.stateCounts, props.selectedState]);

  // Hotspots: warm color ramp on every state that scores, plus ranked rings on the top states and counties.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const fc = fcRef.current;
    if (!fc || !map.getSource("states")) return;
    const mode = props.hotspotMode ?? "off";
    const data = props.hotspots;
    for (const m of hotspotMarkersRef.current) m.remove();
    hotspotMarkersRef.current = [];
    const byState = new Map((data?.states ?? []).map((h) => [h.state, h]));
    const max = mode === "off" ? 0 : Math.max(0, ...(data?.states ?? []).map((h) => metric(h, mode)));
    for (const f of fc.features) {
      const h = byState.get(f.properties.abbr);
      const heat = mode === "off" || !h || max === 0 ? 0 : Math.max(0.08, metric(h, mode) / max);
      map.setFeatureState({ source: "states", id: f.id as number }, { heat });
    }
    if (mode === "off" || !data) return;
    const ring = (h: (typeof data.states)[number], rank: number, at: [number, number], small: boolean) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = small ? "hotspot-ring hotspot-ring-county" : "hotspot-ring";
      el.textContent = small ? "" : String(rank);
      el.setAttribute("aria-label", `Hotspot ${rank}: ${hotspotLabel(h)}. ${hotspotSummary(h)}.`);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        propsRef.current.onSelectState(h.state);
      });
      el.addEventListener("mouseenter", () => popupRef.current?.setLngLat(at).setHTML(`<strong>#${rank} ${escapeHtml(hotspotLabel(h))}</strong><br>${escapeHtml(hotspotSummary(h))}`).addTo(map));
      el.addEventListener("mouseleave", () => popupRef.current?.remove());
      hotspotMarkersRef.current.push(new maplibregl.Marker({ element: el, anchor: "center", offset: small ? [0, 0] : [0, -16] }).setLngLat(at).addTo(map));
    };
    rankHotspots(data.states, mode).forEach((h, i) => {
      const f = fc.features.find((x) => x.properties.abbr === h.state);
      if (f) ring(h, i + 1, [f.properties.labelLng, f.properties.labelLat], false);
    });
    const groups = rankCountyGroups(data.counties, mode);
    if (groups.length) {
      const place = (pts: Record<string, [number, number, number, number]>) =>
        groups.forEach((g, i) =>
          g.counties.forEach((h) => {
            const p = pts[h.key];
            if (p) ring(h, i + 1, [p[0], p[1]], true);
          }),
        );
      if (countyPointsRef.current) place(countyPointsRef.current);
      else
        fetch("/geo/county-points.json")
          .then((r) => r.json())
          .then((pts) => {
            countyPointsRef.current = pts;
            if (mapRef.current === map) place(pts);
          })
          .catch(() => {});
    }
  }, [ready, props.hotspots, props.hotspotMode]);

  // Fly to the selected state or ZIP.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (props.zipPoint) {
      map.easeTo({ center: props.zipPoint, zoom: Math.max(map.getZoom(), SPREAD_ZOOM + 0.3), pitch: 50, duration: prefersReduced() ? 0 : 900 });
      return;
    }
    if (props.selectedState) {
      const f = fcRef.current?.features.find((x) => x.properties.abbr === props.selectedState);
      if (f) {
        const b = new maplibregl.LngLatBounds();
        for (const poly of f.geometry.coordinates) for (const ring of poly) for (const p of ring) b.extend(p as [number, number]);
        map.fitBounds(b, { padding: 60, maxZoom: 6, duration: prefersReduced() ? 0 : 900, pitch: 45 });
      }
    }
  }, [ready, props.selectedState, props.zipPoint]);

  // Program markers at the ZIP point: one cluster bubble when zoomed out, spread icons when zoomed in.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
    if (!props.zipPoint) return;
    const list = props.localPrograms;
    const spread = zoom >= SPREAD_ZOOM;
    const pin = document.createElement("div");
    pin.setAttribute("aria-hidden", "true");
    pin.style.cssText = "width:14px;height:14px;border-radius:50%;background:#2563c7;border:3px solid #fff;box-shadow:0 0 0 2px #2563c7;";
    pin.title = `Search location: ZIP ${props.zipLabel ?? ""}`;
    markersRef.current.push(new maplibregl.Marker({ element: pin }).setLngLat(props.zipPoint).addTo(map));
    if (!list.length) return;
    if (!spread) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "marker-icon";
      el.style.cssText = "width:34px;height:34px;font-weight:700;font-size:13px;color:#2563c7;border-color:#2563c7;cursor:pointer;";
      el.textContent = String(list.length);
      el.setAttribute("aria-label", `${list.length} programs returned for ZIP ${props.zipLabel}. Zoom in to see each.`);
      el.title = `${list.length} programs for ZIP ${props.zipLabel} (markers show the search location, not provider offices)`;
      el.addEventListener("click", () => map.easeTo({ center: props.zipPoint!, zoom: SPREAD_ZOOM + 0.6, duration: prefersReduced() ? 0 : 600 }));
      markersRef.current.push(new maplibregl.Marker({ element: el, offset: [0, -22] }).setLngLat(props.zipPoint).addTo(map));
      return;
    }
    list.forEach((p, i) => {
      const kind = iconForCategory(p.categories[0]);
      const el = document.createElement("button");
      el.type = "button";
      el.className = "marker-icon";
      el.dataset.selected = String(p.id === props.selectedId);
      el.innerHTML = iconSvg(kind, 16);
      el.setAttribute("aria-label", `${p.name} (${ICON_LABELS[kind]})`);
      el.title = `${p.name} — ${p.providerName}. Shown at your search location; eligibility depends on the program's service area.`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        propsRef.current.onSelectProgram(p.id);
      });
      el.addEventListener("mouseenter", () => {
        propsRef.current.onHoverProgram?.(p.id);
        popupRef.current?.setLngLat(props.zipPoint!).setHTML(`<strong>${escapeHtml(p.name)}</strong><br>${escapeHtml(p.providerName)} · ${ICON_LABELS[kind]}`).addTo(map);
      });
      el.addEventListener("mouseleave", () => {
        propsRef.current.onHoverProgram?.(undefined);
        popupRef.current?.remove();
      });
      // Spiral layout around the search point, in screen pixels.
      const angle = i * 2.4;
      const r = 26 + 7 * Math.sqrt(i + 1);
      markersRef.current.push(new maplibregl.Marker({ element: el, offset: [Math.cos(angle) * r, Math.sin(angle) * r - 10] }).setLngLat(props.zipPoint!).addTo(map));
    });
  }, [ready, zoom, props.zipPoint, props.localPrograms, props.selectedId, props.zipLabel]);

  const reset = () => {
    mapRef.current?.fitBounds(PSEUDO_BOUNDS, { padding: FIT_PADDING, pitch: HOME_PITCH, bearing: 0, duration: prefersReduced() ? 0 : 700 });
    props.onSelectState(undefined);
  };

  if (error) return <div className="notice" data-tone="amber">The 3D map could not start ({error}). Use the state list and search below.</div>;
  return (
    <>
      <div ref={container} className="map-canvas" role="region" aria-label="Interactive 3D map of the United States. Click a state to filter programs. Keyboard users can choose a state from the State menu above." />
      <div className="map-controls">
        <button type="button" className="btn" aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}>+</button>
        <button type="button" className="btn" aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}>−</button>
        <button type="button" className="btn" aria-label="Tilt map" title="Tilt" onClick={() => mapRef.current?.easeTo({ pitch: (mapRef.current.getPitch() + 25) % 70 })}>⟋</button>
        <button type="button" className="btn" aria-label="Reset view" title="Reset view" onClick={reset}>⌂</button>
      </div>
    </>
  );
}

function prefersReduced() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
