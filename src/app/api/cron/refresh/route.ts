import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/admin/cron-auth";
import { getDb } from "@/lib/db/client";
import { runIngestion } from "@/lib/pipeline/ingest";
import { redactForLog } from "@/lib/search/params";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Scheduled refresh (Vercel Cron or any scheduler): Authorization: Bearer $CRON_SECRET */
export async function GET(req: Request) {
  if (!cronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  const only = new URL(req.url).searchParams.get("only")?.split(",");
  const out = await runIngestion({ db, only, trigger: "cron" });
  return NextResponse.json(redactForLog(out));
}
