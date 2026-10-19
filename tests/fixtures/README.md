# Test fixtures

Everything in this folder is **synthetic test data**. Names, amounts, dates and URLs are invented so
tests are deterministic. Fixture records carry `isFixture: true` (or a `TEST FIXTURE` marker) and the
ingestion pipeline refuses them outside tests (`upsertPrograms` rejects fixtures unless
`allowFixtures` is set). Nothing here is ever shown to users.
