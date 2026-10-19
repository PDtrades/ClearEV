import { sql } from "drizzle-orm";
import type { DB } from "../db/client";
import { sources } from "../db/schema";
import { afdcAdapter } from "./afdc";
import { federalAdapter, stateAdapter } from "./curated";
import { openeiAdapter } from "./openei";
import { rewiringAmericaAdapter } from "./rewiring-america";
import { isBulk, missingEnv, type Adapter, type BulkAdapter, type OnDemandAdapter } from "./types";

/** All adapters. Adding a source = adding an adapter here. */
export const ADAPTERS: Adapter[] = [federalAdapter, stateAdapter, afdcAdapter, rewiringAmericaAdapter, openeiAdapter];

export const bulkAdapters = (): BulkAdapter[] => ADAPTERS.filter(isBulk);
export const onDemandAdapters = (): OnDemandAdapter[] => ADAPTERS.filter((a): a is OnDemandAdapter => !isBulk(a));
export const adapterById = (id: string) => ADAPTERS.find((a) => a.meta.id === id);

export function configState(a: Adapter, env: Record<string, string | undefined> = process.env): "configured" | "missing_credentials" {
  return missingEnv(a.meta, env).length ? "missing_credentials" : "configured";
}

/** Upserts the source registry rows so admin and coverage pages can show every known source. */
export async function ensureSources(db: DB, env: Record<string, string | undefined> = process.env): Promise<void> {
  for (const a of ADAPTERS) {
    await db
      .insert(sources)
      .values({
        id: a.meta.id,
        name: a.meta.name,
        kind: a.meta.kind,
        homepage: a.meta.homepage,
        termsUrl: a.meta.termsUrl,
        attribution: a.meta.attribution,
        configState: configState(a, env),
      })
      .onConflictDoUpdate({
        target: sources.id,
        set: { name: a.meta.name, kind: a.meta.kind, homepage: a.meta.homepage, termsUrl: a.meta.termsUrl, attribution: a.meta.attribution, configState: sql`excluded.config_state` },
      });
  }
}
