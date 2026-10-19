/** Usage: npm run ingest [-- --only afdc,federal_curated] */
import { createDb, migrateDb } from "../src/lib/db/client";
import { runIngestion } from "../src/lib/pipeline/ingest";
import { ensureSources } from "../src/lib/sources/registry";
import { redactForLog } from "../src/lib/search/params";

(async () => {
  const i = process.argv.indexOf("--only");
  const only = i > -1 ? process.argv[i + 1].split(",") : undefined;
  const { db, close } = await createDb();
  if (!process.env.DATABASE_URL || process.env.AUTO_MIGRATE === "true") await migrateDb(db);
  await ensureSources(db);
  const out = await runIngestion({ db, only, trigger: "cli" });
  console.log(JSON.stringify(redactForLog(out), null, 2));
  await close();
  if (Object.values(out).some((o) => o.status === "failed")) process.exit(2);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
