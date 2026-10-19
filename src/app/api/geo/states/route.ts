import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { stateCounts } from "@/lib/search/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    return NextResponse.json(await stateCounts(db), { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    return NextResponse.json({}, { status: 503 });
  }
}
