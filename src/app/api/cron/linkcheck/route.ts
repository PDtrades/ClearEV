import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/admin/cron-auth";
import { getDb } from "@/lib/db/client";
import { checkLinks } from "@/lib/pipeline/linkcheck";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  return NextResponse.json(await checkLinks(db, { limit: 150 }));
}
