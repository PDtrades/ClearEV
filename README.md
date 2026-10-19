# ClearEV

ClearEV helps people discover **live** US electric-vehicle, home-charging, public-charging, solar, home-battery, utility-rate and company-sponsored savings programs by ZIP code or on an interactive 3D map, and explains for each program what it supports, what kind of benefit it is, how much it may be worth (when the source says), who may qualify, how to apply, and where the information came from and when it was last checked.

It lists only what traceable sources publish. It never invents programs, amounts, deadlines or URLs, and it never promises eligibility or savings.

- [Architecture decisions](docs/ARCHITECTURE.md)
- [Coverage and limitations](docs/COVERAGE.md)
- [Data sources and credentials still required](docs/DATA-SOURCES.md)
- [Hosting and deployment](docs/DEPLOYMENT.md)
- [Administrative workflow](docs/ADMIN.md)

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 15 (App Router) + React 19, TypeScript |
| Database | PostgreSQL via Drizzle ORM and SQL migrations; embedded PostgreSQL ([PGlite](https://pglite.dev)) for local dev and tests, so no database install is needed |
| Map | MapLibre GL JS with extruded state polygons in an Albers USA composite (Alaska, Hawaii and DC deliberately placed); SVG fallback without WebGL |
| Geography | US Census ZCTA Gazetteer + cartographic boundaries, built into static files (`npm run geo:build`) |
| Tests | Vitest (unit, embedded Postgres) and Playwright (desktop, mobile, no-WebGL) |

## Local setup

Requirements: Node 20.18+ (tested on 22). No database or API key is needed to run the app; keys unlock the live sources.

```bash
npm install
cp .env.example .env.local        # fill in keys you have; see docs/DATA-SOURCES.md
npm run db:migrate                # creates .data/pglite and applies drizzle/*.sql
npm run ingest                    # pulls every configured bulk source (federal IRS pages, AFDC)
npm run dev                       # http://localhost:3000
```

Useful commands:

```bash
npm run ingest -- --only afdc     # one source
npm run linkcheck                 # verify official links (stores results, flags after 3 failures)
npm run geo:build                 # rebuild ZIP/state geography from the bundled Census data
npm run admin:hash -- 'password'  # generate ADMIN_PASSWORD_HASH
npm test                          # unit tests (56)
npm run test:e2e                  # Playwright: builds nothing, expects `npm run build` first
npm run lint                      # tsc --noEmit
npm run build && npm start        # production build
```

Playwright runs the production build against a throwaway database seeded only with the curated federal records (`scripts/e2e-server.mjs`). If Playwright's bundled browser is unavailable, point it at an installed Chromium with `PLAYWRIGHT_CHROMIUM=/path/to/chromium`.

## Data sources

Every program comes from a **source adapter** (`src/lib/sources/*`), each declaring its terms, attribution, required credentials and allowed hosts:

| Source | Kind | Needs | Covers |
|---|---|---|---|
| `federal_curated` — IRS pages | curated, re-verified by quote on every run | nothing | Federal 30D, 25E, 30C, 25D credits with their current termination dates |
| `afdc` — DOE Alternative Fuels Data Center Laws & Incentives API | bulk, scheduled | `NREL_API_KEY` (api.data.gov, free) | State and utility/private EV + charging incentives, all states + DC |
| `rewiring_america` — Rewiring America Incentives API | on demand per ZIP, cached ≤ 24 h per its terms | `REWIRING_AMERICA_API_KEY` (free) | Solar, battery, EV charger, new/used EV incentives, income-screened, federal/state/utility/local |
| `openei_urdb` — OpenEI Utility Rate Database | on demand per ZIP, CC0 | `NREL_API_KEY` | EV and time-of-use residential rate plans for utilities near a ZIP |

See [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) for terms review, access methods and what is still needed. Without keys the app runs, shows the federal records, and labels every other source as *Not connected* on the results panel and the Coverage page.

## Privacy

Household income, household size, filing status, homeowner/renter and vehicle details are optional, travel only in the body of the search request, are never written to the URL, never persisted, and are redacted from logs. See `/privacy` in the app and `src/lib/search/params.ts` (two separate schemas enforce the split).

## Repository layout

```
data/curated/federal.json     curated records with verbatim IRS quotes (production data)
data/geo/                     ZIP → point/state/county (built from Census data)
drizzle/                      SQL migrations
public/geo/                   state polygons for the 3D map and SVG fallback
scripts/                      migrate, ingest, linkcheck, geo build, admin hash
src/app/                      routes: /, /program/[id], /coverage, /privacy, /admin, /api/*
src/components/               Explorer, UsMap (3D), UsMapFallback (SVG), Filters, ResultCard
src/lib/domain/               normalized program schema (zod)
src/lib/sources/              adapters + registry
src/lib/pipeline/             ingest/upsert, dedupe, link checks
src/lib/search/               URL/sensitive param schemas, search service
src/lib/eligibility/          eligibility verdicts (relevant / verified / needs info / ineligible)
src/lib/security/             SSRF-safe fetch, sanitizer
tests/unit, tests/e2e         tests; tests/fixtures holds clearly labeled synthetic data
```

## Static preview (no server)

`npm run preview:build` (with the app running on port 3100, e.g. `node scripts/e2e-server.mjs`) snapshots the published records and server-rendered program, coverage and privacy pages, then bundles the real client components into `preview/dist/`. Search runs in the browser through `preview/browser-search.ts`, which mirrors `src/lib/search/service.ts`; on-demand sources (Rewiring America, OpenEI) are not available there. Use it for demos only, never as the production site.
