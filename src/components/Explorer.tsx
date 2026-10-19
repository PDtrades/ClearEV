"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ICON_LABELS, type IconKind } from "@/lib/domain/program";
import { SUPPORTED_STATES } from "@/lib/geo/states";
import { toSearchString, type SensitiveParams, type ShareableParams } from "@/lib/search/params";
import type { SearchResponse } from "@/app/api/search/route";
import { ActiveFilters, Filters } from "./Filters";
import { CategoryIcon } from "./Icons";
import { cssId, ResultCard } from "./ResultCard";
import { UsMapFallback } from "./UsMapFallback";
import { HotspotPanel, type HotspotView } from "./HotspotPanel";
import type { HotspotData } from "@/lib/search/hotspots";
import { EV_FRIENDLINESS } from "@/lib/geo/ev-friendliness";
import { EvFriendlyPanel } from "./EvFriendlyPanel";

const UsMap = dynamic(() => import("./UsMap"), { ssr: false, loading: () => <p className="muted small" style={{ padding: 16 }}>Loading 3D map…</p> });

const LEGEND: IconKind[] = ["bolt", "solar", "battery", "plug", "general"];
const LOCAL_COVERAGE = new Set(["utility", "zip", "county", "municipality", "other"]);

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

const NO_HOTSPOTS: HotspotData = { states: [], counties: [], counted: 0 };

export function Explorer({ initialParams, initialResult, stateCounts, hotspots = NO_HOTSPOTS }: { initialParams: ShareableParams; initialResult: SearchResponse; stateCounts: Record<string, number>; hotspots?: HotspotData }) {
  const pathname = usePathname();
  const [params, setParams] = useState<ShareableParams>(initialParams);
  const [sensitive, setSensitive] = useState<SensitiveParams>({});
  const [result, setResult] = useState<SearchResponse>(initialResult);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"map" | "list">(initialParams.view ?? "list");
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [zipInput, setZipInput] = useState(initialParams.zip ?? "");
  const [qInput, setQInput] = useState(initialParams.q ?? "");
  const [zipError, setZipError] = useState<string | null>(null);
  const [hotspotMode, setHotspotMode] = useState<HotspotView>("programs");
  const [legendOpen, setLegendOpen] = useState(true);
  const [showBars, setShowBars] = useState(true);
  useEffect(() => {
    if (window.matchMedia("(max-width: 560px)").matches) setLegendOpen(false);
  }, []);
  const first = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => setWebgl(webglAvailable()), []);

  // Keep the URL in sync with shareable state only (history API: no server round-trip per keystroke).
  useEffect(() => {
    const qs = toSearchString({ ...params, view: view === "map" ? "map" : undefined });
    const next = `${pathname}${qs}`;
    if (`${window.location.pathname}${window.location.search}` !== next) window.history.replaceState(window.history.state, "", next);
  }, [params, view, pathname]);

  // Fetch when search inputs change (debounced). Sensitive values go in the POST body only.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setError(null);
      try {
        const { sel: _sel, view: _view, ...p } = params;
        const res = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ params: p, sensitive }), signal: ctrl.signal });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Search failed (${res.status})`);
        setResult(await res.json());
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.zip, params.state, params.q, params.cat, params.benefit, params.status, params.utility, params.applicant, params.deadlineBefore, sensitive]);

  const patch = useCallback((p: Partial<ShareableParams>) => setParams((prev) => ({ ...prev, ...p })), []);
  const patchSensitive = useCallback((p: Partial<SensitiveParams>) => setSensitive((prev) => ({ ...prev, ...p })), []);

  const submitZip = (e: React.FormEvent) => {
    e.preventDefault();
    const z = zipInput.trim();
    if (z && !/^\d{5}(-\d{4})?$/.test(z)) {
      setZipError("Enter a 5-digit ZIP code.");
      return;
    }
    setZipError(null);
    patch({ zip: z ? z.slice(0, 5) : undefined, state: z ? undefined : params.state, q: qInput.trim() || undefined, sel: undefined });
  };
  const selectState = (abbr: string | undefined) => {
    setZipInput("");
    patch({ state: abbr, zip: undefined, sel: undefined });
  };
  const selectProgram = (id: string) => {
    patch({ sel: id });
    document.getElementById(`result-${cssId(id)}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  const clearFilters = () => {
    setSensitive({});
    setQInput("");
    patch({ cat: [], benefit: [], status: [], utility: undefined, applicant: undefined, deadlineBefore: undefined, q: undefined });
  };

  const localPrograms = useMemo(() => result.programs.filter((p) => LOCAL_COVERAGE.has(p.coverage.type)), [result.programs]);
  const selected = result.programs.find((p) => p.id === params.sel);
  const loc = result.location;

  return (
    <div>
      <section className="hero">
        <h1>Find EV, charging, solar, battery and utility savings near you</h1>
        <p>Enter a ZIP code or pick a state. Every program shows its official source and when it was last checked. ClearEV lists what sources publish; it does not promise eligibility or savings.</p>
        <form className="card searchbar" onSubmit={submitZip} role="search" aria-label="Search programs" noValidate>
          <div className="field">
            <label htmlFor="zip">ZIP code</label>
            <input id="zip" className="input" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{5}(-[0-9]{4})?" placeholder="e.g. 94110" value={zipInput} onChange={(e) => setZipInput(e.target.value)} aria-describedby={zipError ? "zip-error" : undefined} aria-invalid={!!zipError} />
            {zipError && <span id="zip-error" className="small" style={{ color: "var(--red)" }}>{zipError}</span>}
          </div>
          <div className="field">
            <label htmlFor="state">State</label>
            <select id="state" className="input" value={params.zip ? "" : (params.state ?? "")} onChange={(e) => selectState(e.target.value || undefined)}>
              <option value="">{params.zip ? `From ZIP (${loc?.state?.abbr ?? "…"})` : "All states"}</option>
              {SUPPORTED_STATES.map((s) => (
                <option key={s.abbr} value={s.abbr}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field searchbar-q">
            <label htmlFor="q">Keyword</label>
            <input id="q" className="input" placeholder="e.g. charger, solar, time-of-use" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          </div>
          <div className="field" style={{ justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-primary">Search</button>
          </div>
        </form>
      </section>

      <div className="row" style={{ justifyContent: "space-between", marginTop: 12 }}>
        <ActiveFilters params={params} sensitive={sensitive} onParams={patch} onSensitive={patchSensitive} />
        <div className="view-switch" role="group" aria-label="Map or list view">
          <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>Map</button>
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>List</button>
        </div>
      </div>

      <div className="explorer" data-view={view}>
        <section className="card map-panel" aria-label="Map">
          <div className="map-wrap">
            {webgl === null ? null : webgl ? (
              <UsMap stateCounts={stateCounts} selectedState={loc?.state?.abbr} selectedId={params.sel} zipPoint={result.zipPoint} zipLabel={loc?.zip?.zip} localPrograms={localPrograms} onSelectState={selectState} onSelectProgram={selectProgram} hotspots={hotspots} hotspotMode={hotspotMode} evFriendliness={EV_FRIENDLINESS} showBars={showBars} />
            ) : (
              <div className="fallback-wrap">
                <p className="notice" data-tone="amber" style={{ margin: 0 }}>3D rendering is not available in this browser, so here is a 2D map. All programs are also in the list.</p>
                <UsMapFallback stateCounts={stateCounts} selectedState={loc?.state?.abbr} zip={loc?.zip} onSelectState={selectState} hotspots={hotspots} hotspotMode={hotspotMode} evFriendliness={EV_FRIENDLINESS} showBars={showBars} />
              </div>
            )}
            {webgl && (
              <div className="card map-hint small">
                {loc?.zip ? (
                  <>Showing <strong>ZIP {loc.zip.zip}</strong> ({loc.zip.countyName ? `${loc.zip.countyName}, ` : ""}{loc.state?.name}). Markers sit at your search location, not at provider offices.</>
                ) : loc?.state ? (
                  <><strong>{loc.state.name}</strong> selected. Enter a ZIP for utility and local programs.</>
                ) : (
                  <>Click a state, or enter a ZIP code. Bars show how EV-friendly each state is; drag with two fingers or right-click to tilt.</>
                )}
              </div>
            )}
            <details className="card map-legend" open={legendOpen} onToggle={(e) => setLegendOpen((e.target as HTMLDetailsElement).open)}>
              <summary><h3>Legend</h3></summary>
              {LEGEND.map((k) => (
                <div key={k} className="legend-row">
                  <span className="card-icon" data-kind={k} style={{ width: 24, height: 24, borderRadius: 7 }}>
                    <CategoryIcon kind={k} size={14} />
                  </span>
                  {ICON_LABELS[k]}
                </div>
              ))}
              {showBars && <div className="legend-row"><span className="ev-swatch" aria-hidden="true" style={{ margin: "0 6px" }} />Bar height = EV-friendliness score (0–100)</div>}
              {hotspotMode !== "off" && <div className="legend-row"><span className="hotspot-dot" aria-hidden="true" style={{ margin: "0 7px" }} />Hotspot: warmer color = {hotspotMode === "programs" ? "more open programs" : "larger stated amount"}</div>}
            </details>
          </div>
          <HotspotPanel data={hotspots} mode={hotspotMode} onMode={setHotspotMode} onSelectState={(abbr) => selectState(abbr)} />
          <EvFriendlyPanel data={EV_FRIENDLINESS} show={showBars} onShow={setShowBars} selectedState={loc?.state?.abbr} onSelectState={(abbr) => selectState(abbr)} />
        </section>

        <section className="results-panel" aria-label="Results" aria-busy={loading}>
          <div className="results-head">
            <h2 style={{ margin: 0 }}>
              {loc?.zip ? `Programs for ZIP ${loc.zip.zip}` : loc?.state ? `Programs in ${loc.state.name}` : "Programs"}
              <span className="muted small" style={{ marginLeft: 8 }}>
                {loading ? "Searching…" : `${result.programs.length}${result.totalBeforeFilters > result.programs.length ? ` of ${result.totalBeforeFilters}` : ""} shown`}
              </span>
            </h2>
            {params.state || params.zip ? (
              <button type="button" className="btn btn-sm" onClick={() => { setZipInput(""); patch({ state: undefined, zip: undefined, sel: undefined }); }}>
                Clear location
              </button>
            ) : null}
          </div>
          <Filters params={params} sensitive={sensitive} utilities={result.utilities} onParams={patch} onSensitive={patchSensitive} onClear={clearFilters} />
          {error && <div className="notice" data-tone="red" role="alert">{error} Showing the last successful results.</div>}
          <CoverageNotices result={result} />
          {selected && (
            <div className="notice" data-tone="green" aria-live="polite">
              Selected: <strong>{selected.name}</strong> — {selected.coverage.type === "national" ? "applies nationwide" : selected.coverage.type === "state" ? `statewide in ${selected.coverage.states.join(", ")}` : "shown at your search location"}.
              <button type="button" className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => patch({ sel: undefined })}>Clear</button>
            </div>
          )}
          <div className="results-list" role="list" aria-label="Program results">
            {result.programs.length === 0 && !loading ? (
              <EmptyState reason={result.emptyReason} hasFilters={result.totalBeforeFilters > 0} />
            ) : (
              result.programs.map((p) => (
                <div key={p.id} role="listitem">
                  <ResultCard p={p} selected={p.id === params.sel} onSelect={selectProgram} collapsedIds={result.collapsed[p.id]} />
                </div>
              ))
            )}
          </div>
          <SourcesStatus result={result} />
        </section>
      </div>
    </div>
  );
}

function CoverageNotices({ result }: { result: SearchResponse }) {
  if (!result.coverageNotes.length && !result.screened) return null;
  return (
    <div className="notice" data-tone="amber">
      <strong>Coverage notes</strong>
      <ul>
        {result.coverageNotes.map((n) => (
          <li key={n}>{n}</li>
        ))}
        {!result.screened && result.location?.zip && <li>Income-based programs are shown without screening until you enter household details (optional).</li>}
      </ul>
    </div>
  );
}

function EmptyState({ reason, hasFilters }: { reason?: SearchResponse["emptyReason"]; hasFilters: boolean }) {
  const text: Record<NonNullable<SearchResponse["emptyReason"]>, { title: string; body: string }> = {
    no_location: { title: "Choose a location to start", body: "Enter a ZIP code or select a state on the map. Nationwide programs appear with any location." },
    no_matches: { title: "No matching programs in the connected sources", body: "This is not proof that no programs exist. The connected sources returned nothing for this area; check the Coverage page for what is and is not covered." },
    incomplete_coverage: { title: "Coverage for this location is incomplete", body: "One or more data sources are not connected in this deployment, so programs for this area may be missing. See the Coverage page." },
    source_unavailable: { title: "A data source is temporarily unavailable", body: "Results for this location could not be retrieved right now. Try again shortly; programs are not gone, just unreachable." },
    filters_too_restrictive: { title: "Your filters hide every result", body: "Remove a filter or two to see programs for this location." },
    unsupported_area: { title: "Outside current coverage", body: "ClearEV currently covers the 50 states and Washington, DC." },
  };
  const t = text[reason ?? (hasFilters ? "filters_too_restrictive" : "no_matches")];
  return (
    <div className="card empty">
      <h3 style={{ marginTop: 0 }}>{t.title}</h3>
      <p className="muted small">{t.body}</p>
    </div>
  );
}

function SourcesStatus({ result }: { result: SearchResponse }) {
  const tone: Record<string, string> = { ok: "green", stale: "amber", unavailable: "red", not_configured: "amber", not_applicable: "outline" };
  const label: Record<string, string> = { ok: "Connected", stale: "Stale", unavailable: "Unavailable", not_configured: "Not connected", not_applicable: "Needs ZIP" };
  return (
    <details className="card" style={{ padding: "10px 14px" }}>
      <summary className="small">Data sources used for these results</summary>
      <ul className="small" style={{ paddingLeft: 18, margin: "8px 0 0" }}>
        {result.sourcesStatus.map((s) => (
          <li key={s.id} style={{ marginBottom: 4 }}>
            <span className="tag" data-tone={tone[s.state]}>{label[s.state]}</span> <a href={s.homepage} rel="noopener noreferrer">{s.name}</a>
            {s.detail ? <span className="muted"> — {s.detail}</span> : null}
            {s.attribution ? <div className="muted">{s.attribution}</div> : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
