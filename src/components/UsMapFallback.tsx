"use client";
import { useEffect, useState } from "react";
import { ALBERS_HEIGHT, ALBERS_WIDTH, albers } from "@/lib/geo/projection";
import { metric, rankHotspots, type HotspotData } from "@/lib/search/hotspots";
import { hotspotLabel, hotspotSummary, type HotspotView } from "./HotspotPanel";
import { fmtCost, type EvFriendlyData } from "@/lib/geo/ev-friendliness";

const barColor = (s: number) => (s >= 60 ? "#1d8a5a" : s >= 35 ? "#e9a23b" : "#c8553d");

type Paths = Record<string, { d: string; name: string; cx: number; cy: number }>;

/** 2D SVG map for browsers without WebGL. Every state is a keyboard-focusable button. */
const HEAT = ["#fde9cc", "#f9c98f", "#f7b267", "#f08a4f", "#e8603c"];

export function UsMapFallback({ stateCounts, selectedState, zip, onSelectState, hotspots, hotspotMode = "off", evFriendliness, showBars = true }: { stateCounts: Record<string, number>; selectedState?: string; zip?: { lat: number; lng: number; zip: string }; onSelectState: (abbr: string | undefined) => void; hotspots?: HotspotData; hotspotMode?: HotspotView; evFriendliness?: EvFriendlyData; showBars?: boolean }) {
  const [paths, setPaths] = useState<Paths | null>(null);
  useEffect(() => {
    fetch("/geo/state-paths.json").then((r) => r.json()).then(setPaths).catch(() => setPaths({}));
  }, []);
  if (!paths) return <p className="muted small" style={{ padding: 16 }}>Loading map…</p>;
  const zp = zip ? albers([zip.lng, zip.lat]) : null;
  const mode = hotspotMode;
  const byState = new Map((hotspots?.states ?? []).map((h) => [h.state, h]));
  const max = mode === "off" ? 0 : Math.max(0, ...(hotspots?.states ?? []).map((h) => metric(h, mode)));
  const heatFill = (abbr: string) => {
    const h = byState.get(abbr);
    if (mode === "off" || !h || max === 0 || metric(h, mode) === 0) return undefined;
    return HEAT[Math.min(HEAT.length - 1, Math.floor((metric(h, mode) / max) * (HEAT.length - 0.01)))];
  };
  const top = mode === "off" || !hotspots ? [] : rankHotspots(hotspots.states, mode);
  return (
    <svg className="svg-map" viewBox={`0 0 ${ALBERS_WIDTH} ${ALBERS_HEIGHT}`} role="group" aria-label="Map of the United States">
      {Object.entries(paths).map(([abbr, s]) => (
        <path
          key={abbr}
          d={s.d}
          className="state"
          role="button"
          tabIndex={0}
          aria-pressed={selectedState === abbr}
          aria-label={`${s.name}, ${stateCounts[abbr] ?? 0} programs`}
          data-count={stateCounts[abbr] ?? 0}
          style={heatFill(abbr) && selectedState !== abbr ? { fill: heatFill(abbr) } : undefined}
          onClick={() => onSelectState(abbr)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelectState(abbr);
            }
          }}
        >
          <title>{`${s.name}: ${stateCounts[abbr] ?? 0} programs listed`}</title>
        </path>
      ))}
      {Object.entries(paths).map(([abbr, s]) => (abbr === "DC" ? null : <text key={`l-${abbr}`} x={s.cx} y={s.cy + 3} className="state-label">{abbr}</text>))}
      {paths.DC && (
        <g role="button" tabIndex={0} aria-label="District of Columbia" aria-pressed={selectedState === "DC"} onClick={() => onSelectState("DC")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectState("DC"); } }} style={{ cursor: "pointer" }}>
          <circle cx={paths.DC.cx + 18} cy={paths.DC.cy + 10} r={9} fill={selectedState === "DC" ? "#cfe0f8" : "#fff"} stroke="#2563c7" />
          <text x={paths.DC.cx + 18} y={paths.DC.cy + 13} className="state-label" style={{ fontSize: 8, fontWeight: 700 }}>DC</text>
        </g>
      )}
      {showBars &&
        evFriendliness &&
        Object.entries(paths).map(([abbr, s]) => {
          const r = evFriendliness.rows[abbr];
          if (!r || r.score == null || abbr === "DC") return null;
          const h = 4 + r.score * 0.32;
          return (
            <rect key={`ev-${abbr}`} className="svg-ev-bar" x={s.cx + 9} y={s.cy + 4 - h} width={5} height={h} rx={1} fill={barColor(r.score)}>
              <title>{`${s.name}: EV-friendliness ${r.score}/100 (${r.portsPer100k} charging ports per 100k people, ${fmtCost(evFriendliness, r.cost)} home electricity)`}</title>
            </rect>
          );
        })}
      {top.map((h, i) => {
        const s = paths[h.state];
        if (!s) return null;
        return (
          <g key={`hs-${h.key}`} className="svg-hotspot" role="button" tabIndex={0} aria-label={`Hotspot ${i + 1}: ${hotspotLabel(h)}. ${hotspotSummary(h)}.`} onClick={() => onSelectState(h.state)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectState(h.state); } }}>
            <title>{`#${i + 1} ${hotspotLabel(h)}: ${hotspotSummary(h)}`}</title>
            <circle cx={s.cx} cy={s.cy - 14} r={9} />
            <text x={s.cx} y={s.cy - 10.5} textAnchor="middle">{i + 1}</text>
          </g>
        );
      })}
      {zp && (
        <g aria-label={`Search location ZIP ${zip!.zip}`}>
          <circle cx={zp[0]} cy={zp[1]} r={6} fill="#2563c7" stroke="#fff" strokeWidth={2} />
        </g>
      )}
    </svg>
  );
}
