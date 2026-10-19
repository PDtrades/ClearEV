# Data sources, access terms, and credentials still required

Reviewed 2026-10-19. Before adding a source, record here: access method, terms, attribution, and what is retained.

## Connected adapters

### Federal tax credits (curated from IRS pages)
- **Access:** public irs.gov pages, read manually; values quoted verbatim in `data/curated/federal.json`; re-verified by fetching the page and checking each quote on every ingestion run.
- **Terms:** US Government works, public domain.
- **Pages used:** credits-for-new-clean-vehicles-purchased-in-2023-or-after, used-clean-vehicle-credit, alternative-fuel-vehicle-refueling-property-credit, residential-clean-energy-credit, and the OBBB FAQ page (termination dates).

### State and regional programs (curated from official pages)
- **Access:** official state agency, air district and utility program pages, read on 2026-10-19; values quoted in `data/curated/states.json` (21 records in IL, CA, CO, OR, NM, NY, NJ, CT, MA, RI, DE, ME, MD, AZ, TX). The adapter `state_curated` re-checks every quote on each ingestion run and may fetch only the hosts those records cite.
- **Terms:** public government pages; utility pages are quoted for facts only.
- **Known weak spots:** quotes were captured through a web reader rather than a raw download, so a few may differ in punctuation and will be flagged for review on the first run with network access. Some amounts come from bare table cells ("$7,000") and say so in the record's uncertainties. Vehicle Exchange Colorado is marked status unknown because its page does not say whether applications are open.
- **Skipped on purpose:** programs whose pages say they are closed, paused or out of funds (for example Minnesota's EV rebate, Pennsylvania's AFV rebate, Washington's instant rebate, Texas TCEQ LDV incentive, Oregon Solar + Storage).

### Utility, county and city programs (curated from official pages)
- **Access:** official utility, municipal utility, community choice aggregator, air district and city pages, read on 2026-10-19; values quoted in `data/curated/local.json` (80 records: 75 utility, 3 city, 2 county; 34 states plus DC; 74 active, 6 status unknown). The adapter `local_curated` re-checks every quote on each run and may fetch only the hosts those records cite.
- **Terms:** facts quoted from public pages, with a link back to each official page.
- **Known weak spots:** quotes were captured through a web reader, not a raw download, so the first networked run will flag any that differ. Ameren Missouri's rate prices come from image text on its page; ComEd's rebate is quoted from ComEd's own press release because comed.com needs JavaScript; Rhode Island Energy's EV program is quoted from its enrollment partner's site. Utility programs are matched by state; only programs whose page names counties (Con Edison, NYC, DC, San Joaquin Valley) count toward county hotspots.
- **Not yet covered:** AK, DE, IA, ID, KS, KY, MD, ME, MT, NC, NE, NV, OH, PA, SC, WV, WY, and California CCAs such as CleanPowerSF, Ava and Clean Power Alliance. Pages that block automated reading (Evergy, BGE, PECO, Duquesne) were skipped rather than quoted from third parties.

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
- Elevation: AWS Terrain Tiles (Mapzen/Tilezen terrarium tiles; sources include USGS 3DEP, SRTM and ETOPO1), resampled into ClearEV's map layout by `scripts/build-terrain.ts` into `public/geo/terrain/`. Free to use with attribution.
- Lakes and mountain-range names: Natural Earth 1:10m lakes (plus the North America supplement) and geography regions, public domain, written to `public/geo/lakes.json` and `public/geo/ranges.json` by the same script.

### EV-friendliness score inputs (`data/ev-friendliness.json`, no credentials)
- Public and private charging ports by state from the DOE Alternative Fuels Data Center station counts page (read 2026-10-19).
- Average residential electricity price by state, 2024, from U.S. EIA Electric Power Annual table 4 (the cost of charging at home).
- Resident population, July 2025 estimates, U.S. Census Bureau (NST-EST2025-POP).
- The score is the average of each state's percentile rank on ports per 100,000 residents (higher is better) and on electricity price (lower is better). Public charging prices are set by each network and are not published by state, so they are not part of the score.

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
