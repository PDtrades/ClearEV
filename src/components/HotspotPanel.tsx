"use client";
import { stateByAbbr } from "@/lib/geo/states";
import { fmtDollars, rankCountyGroups, rankHotspots, type CountyGroup, type Hotspot, type HotspotData, type HotspotMode } from "@/lib/search/hotspots";

export type HotspotView = HotspotMode | "off";

export function hotspotLabel(h: Hotspot): string {
  return h.level === "county" ? `${h.name ?? `County ${h.key}`}, ${h.state}` : (stateByAbbr(h.state)?.name ?? h.state);
}

export function hotspotSummary(h: Pick<Hotspot, "programs" | "top">): string {
  const n = `${h.programs} open state or local program${h.programs === 1 ? "" : "s"}`;
  return h.top ? `${n}; largest stated amount ${fmtDollars(h.top.value)} (${h.top.programName})` : `${n}; no dollar amount stated`;
}

export function countyGroupLabel(g: CountyGroup): string {
  const names = g.counties.map((c) => c.name ?? c.key);
  if (names.length === 1) return `${names[0]} County, ${g.state}`;
  if (names.length === 2) return `${names[0]} and ${names[1]} counties, ${g.state}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more counties, ${g.state}`;
}

/** Hotspot controls and ranking shown under the map. Rankings come only from loaded program data. */
export function HotspotPanel({ data, mode, onMode, onSelectState }: { data: HotspotData; mode: HotspotView; onMode: (m: HotspotView) => void; onSelectState: (abbr: string) => void }) {
  const rankMode: HotspotMode = mode === "off" ? "programs" : mode;
  const states = rankHotspots(data.states, rankMode);
  const groups = rankCountyGroups(data.counties, rankMode);
  const value = (h: Pick<Hotspot, "programs" | "top">) => (rankMode === "programs" ? `${h.programs} program${h.programs === 1 ? "" : "s"}` : fmtDollars(h.top!.value));

  return (
    <div className="hotspot-strip" aria-label="Hotspots">
      <div className="hotspot-head">
        <strong className="hotspot-title">
          <span className="hotspot-dot" aria-hidden="true" /> Hotspots
        </strong>
        <div className="hotspot-modes" role="group" aria-label="Rank hotspots by">
          <button type="button" aria-pressed={mode === "programs"} onClick={() => onMode("programs")}>Most programs</button>
          <button type="button" aria-pressed={mode === "amount"} onClick={() => onMode("amount")}>Largest amount</button>
          <button type="button" aria-pressed={mode === "off"} onClick={() => onMode("off")}>Off</button>
        </div>
      </div>
      {mode === "off" ? null : states.length === 0 ? (
        <p className="small muted hotspot-empty">
          {rankMode === "amount" && data.states.length
            ? "No loaded state or local program states a dollar amount, so there is nothing to rank by amount yet."
            : "No hotspots yet. Only nationwide programs are loaded, and those apply everywhere, so no state stands out."}
        </p>
      ) : (
        <>
          <ol className="hotspot-list" aria-label={`Top states by ${rankMode === "programs" ? "number of open programs" : "largest stated amount"}`}>
            {states.map((h, i) => (
              <li key={h.key}>
                <button type="button" onClick={() => onSelectState(h.state)} title={hotspotSummary(h)}>
                  <span className="hotspot-rank">{i + 1}</span>
                  <span className="hotspot-name">{hotspotLabel(h)}</span>
                  <span className="hotspot-value">{value(h)}</span>
                </button>
              </li>
            ))}
          </ol>
          {groups.length > 0 && (
            <ol className="hotspot-list hotspot-counties" aria-label="Top counties">
              {groups.map((g, i) => (
                <li key={g.counties.map((c) => c.key).join("-")}>
                  <button type="button" onClick={() => onSelectState(g.state)} title={`${g.counties.map((c) => c.name ?? c.key).join(", ")}: ${hotspotSummary(g)}`}>
                    <span className="hotspot-rank hotspot-rank-county">{i + 1}</span>
                    <span className="hotspot-name">{countyGroupLabel(g)}</span>
                    <span className="hotspot-value">{value(g)}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <p className="small muted hotspot-note">
            Counts open state and local programs; nationwide programs apply everywhere and are not counted.
            {rankMode === "amount" && " Amount is the largest single figure one program states. ClearEV never adds programs together."}
          </p>
        </>
      )}
    </div>
  );
}
