import "@testing-library/jest-dom/vitest";
// Tests never see production credentials or a production database.
delete process.env.DATABASE_URL;
delete process.env.NREL_API_KEY;
delete process.env.REWIRING_AMERICA_API_KEY;
process.env.SOURCE_MIN_INTERVAL_MS = "0";
process.env.SOURCE_RETRY_BASE_MS = "1";
