import { requestOrigin } from "@/lib/admin/origin";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin/session";
import { getDb } from "@/lib/db/client";
import { programs, reviewItems } from "@/lib/db/schema";
import { runIngestion } from "@/lib/pipeline/ingest";
import { checkLinks } from "@/lib/pipeline/linkcheck";
import { adapterById } from "@/lib/sources/registry";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Admin actions (form posts). Session cookie is SameSite=strict, which also blocks cross-site form posts. */
export async function POST(req: Request) {
  if (!(await isAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const action = String(form.get("action") ?? "");
  const back = String(form.get("back") ?? "/admin");
  const origin = requestOrigin(req);
  const safeBack = back.startsWith("/admin") ? back : "/admin";
  const db = await getDb();
  const id = Number(form.get("id"));
  const programId = String(form.get("programId") ?? "");

  switch (action) {
    case "run_source": {
      const sid = String(form.get("sourceId") ?? "");
      if (!adapterById(sid)) return NextResponse.json({ error: "Unknown source" }, { status: 400 });
      await runIngestion({ db, only: [sid], trigger: "admin" });
      break;
    }
    case "linkcheck":
      await checkLinks(db, { limit: 100, olderThanHours: 0 });
      break;
    case "resolve_keep": // accept the change / keep the record published
      if (Number.isFinite(id)) {
        await db.update(reviewItems).set({ status: "resolved", resolution: "kept", resolvedAt: new Date() }).where(eq(reviewItems.id, id));
        if (programId) await db.update(programs).set({ reviewState: "published", updatedAt: new Date() }).where(eq(programs.id, programId));
      }
      break;
    case "resolve_hide": // hide the record from users (e.g. confirmed closed or wrong)
      if (Number.isFinite(id)) {
        await db.update(reviewItems).set({ status: "resolved", resolution: "hidden", resolvedAt: new Date() }).where(eq(reviewItems.id, id));
        if (programId) await db.update(programs).set({ reviewState: "rejected", updatedAt: new Date() }).where(eq(programs.id, programId));
      }
      break;
    case "mark_closed":
      if (programId) {
        await db.update(programs).set({ status: "closed", statusBasis: `Marked closed by an administrator on ${new Date().toISOString().slice(0, 10)}.`, reviewState: "published", updatedAt: new Date() }).where(eq(programs.id, programId));
        if (Number.isFinite(id)) await db.update(reviewItems).set({ status: "resolved", resolution: "marked_closed", resolvedAt: new Date() }).where(eq(reviewItems.id, id));
      }
      break;
    case "set_review_state": {
      const state = String(form.get("state"));
      if (programId && ["published", "needs_review", "rejected"].includes(state)) await db.update(programs).set({ reviewState: state, updatedAt: new Date() }).where(eq(programs.id, programId));
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  return NextResponse.redirect(`${origin}${safeBack}`, 303);
}
