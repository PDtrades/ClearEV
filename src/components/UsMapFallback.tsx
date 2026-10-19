"use client";
import { useEffect, useState } from "react";
import { ALBERS_HEIGHT, ALBERS_WIDTH, albers } from "@/lib/geo/projection";

type Paths = Record<string, { d: string; name: string; cx: number; cy: number }>;

/** 2D SVG map for browsers without WebGL. Every state is a keyboard-focusable button. */
export function UsMapFallback({ stateCounts, selectedState, zip, onSelectState }: { stateCounts: Record<string, number>; selectedState?: string; zip?: { lat: number; lng: number; zip: string }; onSelectState: (abbr: string | undefined) => void }) {
  const [paths, setPaths] = useState<Paths | null>(null);
  useEffect(() => {
    fetch("/geo/state-paths.json").then((r) => r.json()).then(setPaths).catch(() => setPaths({}));
  }, []);
  if (!paths) return <p className="muted small" style={{ padding: 16 }}>Loading map…</p>;
  const zp = zip ? albers([zip.lng, zip.lat]) : null;
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
      {zp && (
        <g aria-label={`Search location ZIP ${zip!.zip}`}>
          <circle cx={zp[0]} cy={zp[1]} r={6} fill="#2563c7" stroke="#fff" strokeWidth={2} />
        </g>
      )}
    </svg>
  );
}
