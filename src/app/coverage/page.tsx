import type { Metadata } from "next";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ingestionRuns, programs, sources } from "@/lib/db/schema";
import { geoMeta } from "@/lib/geo/zip";
import { ADAPTERS } from "@/lib/sources/registry";
import { missingEnv } from "@/lib/sources/types";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "Coverage and sources" };
export const dynamic = "force-dynamic";

export default async function CoveragePage() {
  let srcRows: (typeof sources.$inferSelect)[] = [];
  let counts: Record<string, { n: number; states: number }> = {};
  let lastRuns: Record<string, typeof ingestionRuns.$inferSelect> = {};
  try {
    const db = await getDb();
    srcRows = await db.select().from(sources);
    const c = await db
      .select({ sourceId: programs.sourceId, n: sql<number>`count(*)::int`, states: sql<number>`count(distinct unnest_states)::int` })
      .from(sql`${programs} LEFT JOIN LATERAL unnest(${programs.coverageStates}) AS unnest_states ON true`)
      .where(eq(programs.reviewState, "published"))
      .groupBy(programs.sourceId);
    counts = Object.fromEntries(c.map((r) => [r.sourceId, { n: r.n, states: r.states }]));
    const runs = await db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(50);
    for (const r of runs) if (!lastRuns[r.sourceId]) lastRuns[r.sourceId] = r;
  } catch {}
  const geo = geoMeta() as { pointsSource?: string; stats?: { total?: number } };
  return (
    <div className="container">
      <h1>Coverage and sources</h1>
      <p className="muted">What ClearEV can and cannot show, and where every record comes from. An empty result never means no program exists; it means the connected sources returned nothing.</p>

      <div className="notice" data-tone="amber">
        <strong>Honest summary.</strong> ClearEV covers the 50 states and DC. Federal credits come from curated IRS pages. State and utility EV/charging incentives come from DOE's AFDC when connected. Solar, battery and income-screened programs come from Rewiring America per ZIP when connected. Utility rate plans come from OpenEI per ZIP when connected. Company-sponsored offers are shown only when a connected source publishes them; no company offers are fabricated. Programs that no source tracks will not appear.
      </div>

      <h2>Sources</h2>
      <div style={{ display: "grid", gap: 12 }}>
        {ADAPTERS.map((a) => {
          const row = srcRows.find((s) => s.id === a.meta.id);
          const miss = missingEnv(a.meta, process.env);
          const c = counts[a.meta.id];
          const run = lastRuns[a.meta.id];
          return (
            <section key={a.meta.id} className="card section">
              <h3 style={{ marginTop: 0 }}>
                <a href={a.meta.homepage} rel="noopener noreferrer">{a.meta.name}</a>{" "}
                <span className="tag" data-tone={miss.length ? "amber" : row?.lastError && !row.lastSuccessAt ? "red" : "green"}>
                  {miss.length ? "Not connected" : a.meta.kind === "on_demand" ? "Queried per ZIP" : row?.lastSuccessAt ? "Connected" : "Connected, no data yet"}
                </span>
              </h3>
              <dl className="kv">
                <dt>Covers</dt>
                <dd>{a.meta.covers}</dd>
                <dt>Gaps</dt>
                <dd>{a.meta.gaps}</dd>
                <dt>Access</dt>
                <dd>{a.meta.requiredEnv.length ? `API key required (${a.meta.requiredEnv.join(", ")}).` : "No credentials required."}{miss.length ? ` Missing in this deployment: ${miss.join(", ")}.` : ""}{a.meta.termsUrl ? <> <a href={a.meta.termsUrl} rel="noopener noreferrer">Terms</a>.</> : null}</dd>
                <dt>Attribution</dt>
                <dd>{a.meta.attribution ?? "—"}</dd>
                <dt>Records stored</dt>
                <dd>{c ? `${c.n} programs covering ${c.states} state${c.states === 1 ? "" : "s"}` : a.meta.kind === "on_demand" ? "Fetched live per search; stored only where terms allow." : "None yet"}</dd>
                <dt>Last refresh</dt>
                <dd>{run ? `${fmtDate(run.startedAt.toISOString())} — ${run.status}${run.errors?.length ? ` (${run.errors.length} notes)` : ""}` : "No ingestion run recorded"}{row?.lastError ? <div className="small" style={{ color: "var(--red)" }}>Last error: {row.lastError}</div> : null}</dd>
                <dt>Stale after</dt>
                <dd>{a.meta.staleAfterDays} days without confirmation</dd>
              </dl>
            </section>
          );
        })}
      </div>

      <h2>Geography</h2>
      <p className="small">
        ZIP codes resolve through {geo.pointsSource ?? "Census ZCTA data"} ({geo.stats?.total?.toLocaleString() ?? "?"} ZIP Code Tabulation Areas). ZCTAs approximate USPS ZIP codes; PO-box-only ZIPs may be missing. State and county are assigned from Census boundary files. Utility service territories are not drawn; utility programs are matched by the utilities a source associates with a ZIP, and each such program carries a coverage note.
      </p>

      <h2>What is still needed for full coverage</h2>
      <ul className="small">
        <li>API keys: an api.data.gov key (NREL_API_KEY, used for AFDC and OpenEI) and a Rewiring America key (REWIRING_AMERICA_API_KEY).</li>
        <li>Utility service-territory boundaries (e.g. HIFLD Electric Retail Service Territories) to verify utility coverage instead of inferring it by ZIP.</li>
        <li>A source for company-sponsored and dealer offers; none with permitted reuse is connected.</li>
        <li>Structured amounts for AFDC utility incentives, which are free text in the source.</li>
      </ul>
    </div>
  );
}
