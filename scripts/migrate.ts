import { createDb, migrateDb } from "../src/lib/db/client";
import { ensureSources } from "../src/lib/sources/registry";

(async () => {
  const { db, close } = await createDb();
  await migrateDb(db);
  await ensureSources(db);
  console.log(`Migrated ${process.env.DATABASE_URL ? "PostgreSQL (DATABASE_URL)" : `embedded PGlite at ${process.env.PGLITE_DIR ?? ".data/pglite"}`}`);
  await close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
