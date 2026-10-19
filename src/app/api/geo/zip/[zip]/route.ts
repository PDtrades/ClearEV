import { NextResponse } from "next/server";
import { lonLatToPseudo } from "@/lib/geo/projection";
import { lookupZip, normalizeZip } from "@/lib/geo/zip";

export async function GET(_req: Request, { params }: { params: Promise<{ zip: string }> }) {
  const { zip } = await params;
  if (!normalizeZip(zip)) return NextResponse.json({ error: "Enter a 5-digit ZIP code." }, { status: 400 });
  const info = lookupZip(zip);
  if (!info) return NextResponse.json({ error: "ZIP code not found in Census ZCTA data." }, { status: 404 });
  return NextResponse.json({ ...info, pseudo: lonLatToPseudo(info.lng, info.lat) }, { headers: { "Cache-Control": "public, max-age=86400" } });
}
