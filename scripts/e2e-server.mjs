// Starts the production build against a throwaway PGlite database seeded with the curated federal records.
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";

const dir = process.env.PGLITE_DIR ?? ".data/pglite-e2e";
fs.rmSync(dir, { recursive: true, force: true });
execSync("npx tsx scripts/migrate.ts", { stdio: "inherit", env: { ...process.env, PGLITE_DIR: dir, DATABASE_URL: "" } });
execSync("npx tsx scripts/ingest.ts --only federal_curated,state_curated", { stdio: "inherit", env: { ...process.env, PGLITE_DIR: dir, DATABASE_URL: "", SOURCE_RETRY_BASE_MS: "1" } });
const child = spawn("npx", ["next", "start", "-p", process.env.PORT ?? "3100"], { stdio: "inherit", env: { ...process.env, PGLITE_DIR: dir, DATABASE_URL: "" } });
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
child.on("exit", (c) => process.exit(c ?? 0));
