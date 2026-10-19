import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import path from "node:path";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");
const drivers = new WeakMap<object, "pg" | "pglite">();

/**
 * Production: PostgreSQL via DATABASE_URL (e.g. Neon, Supabase, RDS).
 * Local development and tests: embedded PostgreSQL (PGlite) stored in PGLITE_DIR, or in memory.
 * Both use the same schema and SQL migrations.
 */
export async function createDb(opts: { url?: string; pgliteDir?: string; memory?: boolean } = {}): Promise<{ db: DB; close: () => Promise<void> }> {
  const url = opts.url ?? (opts.memory ? undefined : process.env.DATABASE_URL);
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 5) });
    const db = drizzle(pool, { schema }) as unknown as DB;
    drivers.set(db, "pg");
    return { db, close: () => pool.end() };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dir = opts.memory ? undefined : (opts.pgliteDir ?? process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data/pglite"));
  if (dir) (await import("node:fs")).mkdirSync(dir, { recursive: true });
  const client = dir ? new PGlite(dir) : new PGlite();
  const db = drizzle(client, { schema }) as unknown as DB;
  drivers.set(db, "pglite");
  return { db, close: () => client.close() };
}

export async function migrateDb(db: DB): Promise<void> {
  if (drivers.get(db) === "pglite") {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as never, { migrationsFolder: MIGRATIONS });
  } else {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db as never, { migrationsFolder: MIGRATIONS });
  }
}

const g = globalThis as unknown as { __clearevDb?: Promise<DB> };

/** Shared app-wide connection. Local PGlite databases are migrated automatically on first use. */
export function getDb(): Promise<DB> {
  if (!g.__clearevDb) {
    g.__clearevDb = (async () => {
      const { db } = await createDb();
      if (!process.env.DATABASE_URL || process.env.AUTO_MIGRATE === "true") await migrateDb(db);
      const { ensureSources } = await import("../sources/registry");
      await ensureSources(db);
      return db;
    })().catch((e) => {
      g.__clearevDb = undefined;
      throw e;
    });
  }
  return g.__clearevDb;
}
