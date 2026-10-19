# ClearEV — notes for contributors

- Never add program data without a traceable source: curated records need a verbatim quote + URL per value (see data/curated/federal.json); adapters must not parse numbers a source does not state.
- Test fixtures live only in tests/fixtures and carry `isFixture: true` or a "TEST FIXTURE" marker; `upsertPrograms` rejects fixtures outside tests.
- Sensitive inputs (income, household size, vehicle) go through `sensitiveSchema` only; never add them to `shareableSchema` or the URL.
- Server-side HTTP must use `safeFetch` with the adapter's `allowedHosts`.
- Run `npm run lint && npm test` before committing; `npm run build && npm run test:e2e` for UI changes.
