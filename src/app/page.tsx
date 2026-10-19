import { Explorer } from "@/components/Explorer";
import { getDb } from "@/lib/db/client";
import { lonLatToPseudo } from "@/lib/geo/projection";
import { parseShareable } from "@/lib/search/params";
import { search, stateCounts } from "@/lib/search/service";
import type { SearchResponse } from "./api/search/route";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = parseShareable(await searchParams);
  let result: SearchResponse;
  let counts: Record<string, number> = {};
  try {
    const db = await getDb();
    const [r, c] = await Promise.all([search(db, params, {}), stateCounts(db)]);
    result = { ...r, zipPoint: r.location?.zip ? lonLatToPseudo(r.location.zip.lng, r.location.zip.lat) : null };
    counts = c;
  } catch (e) {
    console.error("home search failed", (e as Error).message);
    result = { location: null, programs: [], collapsed: {}, sourcesStatus: [], utilities: [], coverageNotes: ["The program database is unavailable right now."], emptyReason: "source_unavailable", totalBeforeFilters: 0, screened: false, zipPoint: null };
  }
  return <Explorer initialParams={params} initialResult={result} stateCounts={counts} />;
}
