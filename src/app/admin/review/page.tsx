import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/admin/session";
import { getDb } from "@/lib/db/client";
import { programs, reviewItems } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  if (!(await isAdminSession())) redirect("/admin/login");
  const db = await getDb();
  const items = await db
    .select({ item: reviewItems, name: programs.name, reviewState: programs.reviewState, programUrl: programs.programUrl })
    .from(reviewItems)
    .leftJoin(programs, eq(reviewItems.programId, programs.id))
    .where(eq(reviewItems.status, "open"))
    .orderBy(desc(reviewItems.createdAt))
    .limit(200);
  return (
    <div>
      <h1>Review queue</h1>
      <p className="small muted">Ambiguous changes are queued here instead of being applied silently. Keep = accept and publish; Hide = remove from users; Mark closed = keep visible but closed.</p>
      {items.length === 0 && <p className="notice" data-tone="green">Nothing to review.</p>}
      {items.map(({ item, name, reviewState, programUrl }) => (
        <section key={item.id} className="card section" style={{ marginBottom: 10 }}>
          <div className="row">
            <span className="tag" data-tone="amber">{item.reason.replace(/_/g, " ")}</span>
            <strong>{name ?? item.programId ?? item.sourceId}</strong>
            {item.programId && <Link className="small" href={`/program/${encodeURIComponent(item.programId)}`}>view</Link>}
            {programUrl && <a className="small" href={programUrl} rel="noopener noreferrer">official page</a>}
            <span className="small muted">state: {reviewState ?? "—"} · {item.createdAt.toISOString().slice(0, 16)}</span>
          </div>
          <pre className="small" style={{ whiteSpace: "pre-wrap", background: "#f6f9fc", padding: 10, borderRadius: 8, maxHeight: 260, overflow: "auto" }}>{JSON.stringify(item.details, null, 2)}</pre>
          <div className="row">
            {(["resolve_keep", "resolve_hide", "mark_closed"] as const).map((a) => (
              <form key={a} action="/admin/api/action" method="post">
                <input type="hidden" name="action" value={a} />
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="programId" value={item.programId ?? ""} />
                <input type="hidden" name="back" value="/admin/review" />
                <button className="btn btn-sm" type="submit">{a === "resolve_keep" ? "Keep" : a === "resolve_hide" ? "Hide" : "Mark closed"}</button>
              </form>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
