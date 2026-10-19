import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
// Same cascade order as the Next build, where the library sheet lands before the app sheet.
import "maplibre-gl/dist/maplibre-gl.css";
import "@/app/globals.css";
import "./preview.css";
import { Explorer } from "@/components/Explorer";
import { CloudBackground } from "@/components/CloudBackground";
import { parseShareable } from "@/lib/search/params";
import { hotspotsFrom, makeSearch, stateCountsFrom, type Snapshot } from "./browser-search";
import type { HotspotData } from "@/lib/search/hotspots";

// Static preview of ClearEV: the real client components run in the browser; the server's search runs
// against a snapshot of the published records (see snapshot.mjs), and server-rendered pages are replayed.

type Route = { path: string };
const realFetch = window.fetch.bind(window);

async function boot() {
  const root = createRoot(document.getElementById("app")!);
  try {
    const [snap, zcta, counties] = await Promise.all([
      realFetch("data/snapshot.json").then((r) => r.json() as Promise<Snapshot>),
      realFetch("geo/zcta.json").then((r) => r.json()),
      realFetch("geo/counties.json").then((r) => r.json()),
    ]);
    const search = makeSearch(snap, zcta, counties);

    // Route the app's own API and asset requests to the in-browser search and the published files.
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "/api/search" && init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}"));
        const params = parseShareable(body.params ?? {});
        return new Response(JSON.stringify(search(params, body.sensitive ?? {})), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.startsWith("/geo/")) return realFetch(url.slice(1), init);
      return realFetch(input, init);
    };

    const params = parseShareable(new URLSearchParams(window.location.search));
    const initial = search(params, {});
    const counts = stateCountsFrom(snap.programs);
    const hotspots = hotspotsFrom(snap.programs, counties);
    root.render(<App snap={snap} initialParams={params} initialResult={initial} counts={counts} hotspots={hotspots} />);
  } catch (e) {
    root.render(<p style={{ padding: 24 }}>The preview could not load its data files: {(e as Error).message}</p>);
  }
}

function App({ snap, initialParams, initialResult, counts, hotspots }: { hotspots: HotspotData; snap: Snapshot; initialParams: ReturnType<typeof parseShareable>; initialResult: ReturnType<ReturnType<typeof makeSearch>>; counts: Record<string, number> }) {
  const [route, setRoute] = useState<Route>(() => (window.history.state?.route as Route) ?? { path: "/" });

  useEffect(() => {
    const go = (path: string) => {
      const next = { path };
      window.history.pushState({ ...(window.history.state ?? {}), route: next }, "", window.location.pathname + window.location.search);
      setRoute(next);
      window.scrollTo(0, 0);
    };
    // Capture phase: result cards stop propagation on their links.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      const href = a?.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("//")) return;
      e.preventDefault();
      const path = decodeURIComponent(href.split(/[?#]/)[0]);
      go(path);
    };
    const onPop = (e: PopStateEvent) => setRoute((e.state?.route as Route) ?? { path: "/" });
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    if (!window.history.state?.route) window.history.replaceState({ ...(window.history.state ?? {}), route: { path: "/" } }, "");
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  const page = route.path === "/" ? null : snap.pages[route.path];
  useEffect(() => {
    document.title = page ? page.title : "ClearEV preview";
  }, [page]);

  return (
    <>
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <CloudBackground />
      <div className="preview-banner" role="note">
        <strong>Preview build.</strong> Everything runs in your browser from a snapshot taken {new Date(snap.capturedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}. {snap.programs.some((p) => p.sourceId === "state_curated") ? "It holds the four federal IRS credits plus a hand-checked starter set of state and regional programs; the full state, utility, solar and battery feeds are not connected yet." : "Only the four federal IRS credits are loaded; state, utility, solar and battery sources are not connected yet."}
      </div>
      <header className="site-header">
        <a href="/" className="brand" aria-label="ClearEV home">
          <img src="favicon.svg" alt="" width={32} height={32} />
          ClearEV
        </a>
        <nav className="site-nav" aria-label="Site">
          <a href="/" aria-current={route.path === "/" ? "page" : undefined}>Explore</a>
          <a href="/coverage" aria-current={route.path === "/coverage" ? "page" : undefined}>Coverage &amp; sources</a>
          <a href="/privacy" aria-current={route.path === "/privacy" ? "page" : undefined}>Privacy</a>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        <div hidden={route.path !== "/"}>
          <Explorer initialParams={initialParams} initialResult={initialResult} stateCounts={counts} hotspots={hotspots} />
        </div>
        {route.path !== "/" &&
          (page ? (
            <div dangerouslySetInnerHTML={{ __html: page.html }} />
          ) : (
            <div className="card" style={{ maxWidth: 640, margin: "40px auto", padding: 24 }}>
              <h1>Page not in this preview</h1>
              <p>This page needs the live server. <a href="/">Back to search</a></p>
            </div>
          ))}
      </main>
      <footer className="site-footer">
        <p>ClearEV lists programs from official and reputable sources and shows where each value came from and when it was last checked. It does not promise eligibility, approval, or savings; always confirm with the program administrator.</p>
        <p>Incentive data by <a href="https://www.rewiringamerica.org" rel="noopener noreferrer" target="_blank">Rewiring America</a> where noted · U.S. DOE <a href="https://afdc.energy.gov/laws" rel="noopener noreferrer" target="_blank">Alternative Fuels Data Center</a> · <a href="https://openei.org/wiki/Utility_Rate_Database" rel="noopener noreferrer" target="_blank">OpenEI Utility Rate Database</a> · U.S. Census Bureau geography.</p>
      </footer>
    </>
  );
}

boot();
