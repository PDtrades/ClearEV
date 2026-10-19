import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin/session";
import { getDb } from "@/lib/db/client";
import { ingestionRuns } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  if (!(await isAdminSession())) redirect("/admin/login");
  const db = await getDb();
  const runs = await db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(100);
  return (
    <div>
      <h1>Ingestion runs</h1>
      <table className="data">
        <thead><tr><th>Started</th><th>Source</th><th>Trigger</th><th>Status</th><th>Counts</th><th>Notes</th></tr></thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td>{r.startedAt.toISOString().slice(0, 19)}</td>
              <td>{r.sourceId}</td>
              <td>{r.trigger}</td>
              <td><span className="tag" data-tone={r.status === "success" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status}</span></td>
              <td className="small">{r.counts ? Object.entries(r.counts).map(([k, v]) => `${k} ${v}`).join(", ") : "—"}</td>
              <td className="small" style={{ maxWidth: 420, overflowWrap: "anywhere" }}>{r.errors?.slice(0, 5).join(" · ") ?? "—"}{(r.errors?.length ?? 0) > 5 ? ` (+${r.errors!.length - 5} more)` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
