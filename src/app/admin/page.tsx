import { desc, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin/session";
import { getDb } from "@/lib/db/client";
import { ingestionRuns, linkChecks, programs, reviewItems, sources } from "@/lib/db/schema";
import { countStale } from "@/lib/pipeline/ingest";
import { ADAPTERS } from "@/lib/sources/registry";
import { missingEnv } from "@/lib/sources/types";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  if (!(await isAdminSession())) redirect("/admin/login");
  const db = await getDb();
  const srcRows = await db.select().from(sources);
  const [{ open }] = await db.select({ open: sql<number>`count(*)::int` }).from(reviewItems).where(eq(reviewItems.status, "open"));
  const [{ broken }] = await db.select({ broken: sql<number>`count(*)::int` }).from(linkChecks).where(sql`${linkChecks.consecutiveFailures} >= 3`);
  const counts = await db.select({ sourceId: programs.sourceId, state: programs.reviewState, n: sql<number>`count(*)::int` }).from(programs).groupBy(programs.sourceId, programs.reviewState);
  const lastRun = await db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(1);
  const stale: Record<string, number> = {};
  for (const a of ADAPTERS) stale[a.meta.id] = await countStale(db, a.meta.id, a.meta.staleAfterDays);
  return (
    <div>
      <h1>Ingestion health</h1>
      <div className="row">
        <span className="tag" data-tone={open ? "amber" : "green"}>{open} open review items</span>
        <span className="tag" data-tone={broken ? "red" : "green"}>{broken} broken links</span>
        <span className="tag">Last run: {lastRun[0] ? `${lastRun[0].sourceId} ${lastRun[0].status} ${lastRun[0].startedAt.toISOString()}` : "none"}</span>
        <form action="/admin/api/action" method="post">
          <input type="hidden" name="action" value="linkcheck" />
          <button className="btn btn-sm" type="submit">Run link check (100)</button>
        </form>
      </div>
      <table className="data" style={{ marginTop: 14 }}>
        <thead>
          <tr><th>Source</th><th>Config</th><th>Published / review / hidden</th><th>Stale</th><th>Last success</th><th>Failures</th><th>Last error</th><th></th></tr>
        </thead>
        <tbody>
          {ADAPTERS.map((a) => {
            const r = srcRows.find((s) => s.id === a.meta.id);
            const c = (st: string) => counts.find((x) => x.sourceId === a.meta.id && x.state === st)?.n ?? 0;
            const miss = missingEnv(a.meta, process.env);
            return (
              <tr key={a.meta.id}>
                <td>{a.meta.name}<div className="small muted">{a.meta.kind}</div></td>
                <td>{miss.length ? <span className="tag" data-tone="amber">missing {miss.join(", ")}</span> : <span className="tag" data-tone="green">configured</span>}</td>
                <td>{c("published")} / {c("needs_review")} / {c("rejected")}</td>
                <td>{stale[a.meta.id]}</td>
                <td>{r?.lastSuccessAt?.toISOString().slice(0, 16) ?? "—"}</td>
                <td>{r?.consecutiveFailures ?? 0}</td>
                <td className="small" style={{ maxWidth: 260, overflowWrap: "anywhere" }}>{r?.lastError ?? "—"}</td>
                <td>
                  {a.meta.kind !== "on_demand" && !miss.length && (
                    <form action="/admin/api/action" method="post">
                      <input type="hidden" name="action" value="run_source" />
                      <input type="hidden" name="sourceId" value={a.meta.id} />
                      <button className="btn btn-sm" type="submit">Run now</button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
