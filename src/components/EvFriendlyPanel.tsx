"use client";
import { stateByAbbr } from "@/lib/geo/states";
import { fmtCost, type EvFriendlyData, type EvFriendlyRow } from "@/lib/geo/ev-friendliness";

function fmtDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** EV-friendliness ranking and method, shown under the map next to the hotspots. */
export function EvFriendlyPanel({ data, show, onShow, selectedState, onSelectState }: { data: EvFriendlyData; show: boolean; onShow: (v: boolean) => void; selectedState?: string; onSelectState: (abbr: string) => void }) {
  const rows = Object.values(data.rows).filter((r): r is EvFriendlyRow & { score: number } => r.score != null).sort((a, b) => b.score - a.score || a.state.localeCompare(b.state));
  if (!rows.length || !data.sources) return null;
  const sel = selectedState ? data.rows[selectedState] : undefined;
  const chip = (r: EvFriendlyRow & { score: number }, rank: number) => (
    <li key={r.state}>
      <button type="button" onClick={() => onSelectState(r.state)} title={`${stateByAbbr(r.state)?.name}: ${r.portsPer100k} charging ports per 100,000 people; ${fmtCost(data, r.cost)} average home electricity`}>
        <span className="ev-rank">{rank}</span>
        <span className="hotspot-name">{stateByAbbr(r.state)?.name ?? r.state}</span>
        <span className="ev-chip-meter" aria-hidden="true"><span style={{ width: `${r.score}%` }} /></span>
        <span className="hotspot-value">{r.score}</span>
      </button>
    </li>
  );
  const s = data.sources;
  return (
    <div className="hotspot-strip ev-strip" aria-label="EV-friendliness">
      <div className="hotspot-head">
        <strong className="hotspot-title">
          <span className="ev-swatch" aria-hidden="true" /> EV-friendliness
        </strong>
        <div className="hotspot-modes" role="group" aria-label="EV-friendliness bars">
          <button type="button" aria-pressed={show} onClick={() => onShow(true)}>Bars on</button>
          <button type="button" aria-pressed={!show} onClick={() => onShow(false)}>Off</button>
        </div>
      </div>
      {sel && sel.score != null && (
        <p className="ev-selected">
          <strong>{stateByAbbr(sel.state)?.name}</strong> scores <strong>{sel.score}/100</strong>: {sel.portsPer100k} charging ports per 100,000 people (better than {sel.chargerPct}% of states) and {fmtCost(data, sel.cost)} average home electricity (cheaper than {sel.costPct}% of states).
        </p>
      )}
      <ol className="hotspot-list" aria-label="Most EV-friendly states">{rows.slice(0, 5).map((r, i) => chip(r, i + 1))}</ol>
      <ol className="hotspot-list ev-least" aria-label="Least EV-friendly states">{rows.slice(-3).map((r, i) => chip(r, rows.length - 2 + i))}</ol>
      <p className="small muted hotspot-note">
        Score = average of two state rankings: charging ports per 100,000 residents (<a href={s.chargers.url} target="_blank" rel="noopener noreferrer">DOE Alternative Fuels Data Center</a>, {fmtDate(s.chargers.asOf)}) and average residential electricity price, the main cost of charging at home (<a href={s.cost.url} target="_blank" rel="noopener noreferrer">U.S. EIA</a>, {s.cost.period}; cheaper ranks higher). Population: U.S. Census Bureau, {s.population.period}. Public charging prices vary by network and are not published by state, so they are not included.
      </p>
    </div>
  );
}
