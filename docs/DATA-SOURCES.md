# Data sources, access terms, and credentials still required

Reviewed 2026-10-19. Before adding a source, record here: access method, terms, attribution, and what is retained.

## Connected adapters

### Federal tax credits (curated from IRS pages)
- **Access:** public irs.gov pages, read manually; values quoted verbatim in `data/curated/federal.json`; re-verified by fetching the page and checking each quote on every ingestion run.
- **Terms:** US Government works, public domain.
- **Pages used:** credits-for-new-clean-vehicles-purchased-in-2023-or-after, used-clean-vehicle-credit, alternative-fuel-vehicle-refueling-property-credit, residential-clean-energy-credit, and the OBBB FAQ page (termination dates).

### DOE Alternative Fuels Data Center — Laws and Incentives (NREL API)
- **Endpoint:** `GET https://developer.nrel.gov/api/transportation-incentives-laws/v1.json` (spec: api.data.gov / NREL developer docs).
- **Credential:** `NREL_API_KEY` from https://developer.nrel.gov/signup/ (free; api.data.gov default limit 1,000 requests/hour). ClearEV makes 52 requests per full refresh.
- **Terms:** NREL developer network terms; AFDC content is DOE-published. Attribution shown as "Source: U.S. Department of Energy, Alternative Fuels Data Center".
- **Retention:** full records stored, raw payload kept for audit, refreshed daily.

### Rewiring America Incentives API
- **Endpoint:** `GET https://api.rewiringamerica.org/api/v1/calculator` with `Authorization: Bearer <key>`; parameters zip, owner_status, household_income, household_size, items[], tax_filing, include_beta_states.
- **Credential:** `REWIRING_AMERICA_API_KEY` from https://docs.rewiringamerica.org/signin (free).
- **Terms (https://www.rewiringamerica.org/tools/incentive-api-terms):** default limits 500 req/min and 100,000/day; "Not systematically copy data from our API or cache results for more than 24 hours"; credit "Rewiring America" and link to rewiringamerica.org alongside results; show users a privacy notice; results are educational, not tax advice. Material changes in use require their approval by email.
- **How ClearEV complies:** per-ZIP on-demand queries, cache ≤ 24 h (`RA_CACHE_HOURS`, capped at 24 in code), results never persisted to `programs`, attribution on every card/source list and in the footer, privacy page explains what is sent.
- **Open question for launch:** confirm with Rewiring America that a public program-discovery site is an approved use (their terms contemplate integrations; commercial use is not expressly addressed).

### OpenEI Utility Rate Database (URDB)
- **Endpoint:** `GET https://api.openei.org/utility_rates?version=8&format=json&api_key=…&lat=&lon=&radius=5&sector=Residential&detail=minimal`.
- **Credential:** the same api.data.gov key (`NREL_API_KEY`).
- **Terms:** content CC0 unless noted; attribution to OpenEI/NREL/ISU shown.
- **Retention:** rate records may be stored; cached per ZIP for `OPENEI_CACHE_HOURS` (default 7 days).

### Geography (no credentials)
- 2025 Census ZCTA Gazetteer (public domain) via the `us-zip-centroids` package data file; `scripts/build-geo.ts --gazetteer <file>` accepts the official census.gov file directly.
- 2010 ZCTA-to-county relationship file via `us-zcta-counties`; `--rel <file>` accepts an official file.
- Census cartographic boundaries via `us-atlas` (TopoJSON).

## Credentials, approvals and agreements still required

| Item | Needed for | Who | Cost |
|---|---|---|---|
| `NREL_API_KEY` | AFDC + OpenEI | sign up at developer.nrel.gov | free |
| `REWIRING_AMERICA_API_KEY` | Rewiring America | sign up at docs.rewiringamerica.org | free; confirm approved use by email |
| `CRON_SECRET`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, `CACHE_SALT` | scheduled refresh and admin | generate locally | — |
| `DATABASE_URL` | production Postgres | Neon (or other) account | check Neon pricing; free tier exists |
| Network allowlist for this build environment | running live ingestion from the cloud session | project owner, Project settings → environment | — |
| Utility territory boundaries (HIFLD) | verified utility coverage | public download | free |
| Company/dealer offers feed | commercial promotions category | licensing conversation | unknown |

## Adding a source

1. Create `src/lib/sources/<id>.ts` exporting `meta` and `fetchAll` or `query`.
2. Declare `allowedHosts`, `requiredEnv`, `termsUrl`, `attribution`, `covers`, `gaps`, `priority`, `staleAfterDays`.
3. Produce `NormalizedProgramInput` records; put quotes in `evidence`/`amounts[].evidence`; never parse a number the source does not state.
4. Register it in `registry.ts`; add a fixture under `tests/fixtures` (labeled synthetic) and a normalization test.
5. Document terms here.
