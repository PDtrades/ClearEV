import { createDb } from "../src/lib/db/client";
import { checkLinks } from "../src/lib/pipeline/linkcheck";

(async () => {
  const { db, close } = await createDb();
  console.log(await checkLinks(db, { limit: Number(process.env.LINKCHECK_LIMIT ?? 200) }));
  await close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
