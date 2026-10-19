import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { lonLatToPseudo } from "@/lib/geo/projection";
import { parseShareable, redactForLog, sensitiveSchema } from "@/lib/search/params";
import { search, type SearchResult } from "@/lib/search/service";

export const dynamic = "force-dynamic";

export type SearchResponse = SearchResult & { zipPoint: [number, number] | null };

/**
 * POST { params: shareable, sensitive?: {...} }
 * Sensitive values are read from the body only, used for this request, and never logged or stored.
 */
export async function POST(req: Request) {
  let body: { params?: Record<string, string | string[] | undefined>; sensitive?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const params = parseShareable(body.params ?? {});
  const sens = sensitiveSchema.safeParse(body.sensitive ?? {});
  if (!sens.success) return NextResponse.json({ error: "Invalid filter values", issues: sens.error.issues.map((i) => i.path.join(".")) }, { status: 400 });
  try {
    const db = await getDb();
    const result = await search(db, params, sens.data);
    const zp = result.location?.zip ? lonLatToPseudo(result.location.zip.lng, result.location.zip.lat) : null;
    return NextResponse.json({ ...result, zipPoint: zp } satisfies SearchResponse, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("search failed", redactForLog({ params }), (e as Error).message);
    return NextResponse.json({ error: "Search is temporarily unavailable." }, { status: 503 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = parseShareable(url.searchParams);
  try {
    const db = await getDb();
    const result = await search(db, params, {});
    const zp = result.location?.zip ? lonLatToPseudo(result.location.zip.lng, result.location.zip.lat) : null;
    return NextResponse.json({ ...result, zipPoint: zp } satisfies SearchResponse, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("search failed", redactForLog({ params }), (e as Error).message);
    return NextResponse.json({ error: "Search is temporarily unavailable." }, { status: 503 });
  }
}
