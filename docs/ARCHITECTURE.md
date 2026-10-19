# Architecture decisions

## Framework and database

**Next.js 15 (App Router) + TypeScript.** One codebase serves the UI, the JSON API, scheduled refresh endpoints and the admin interface. Server components render the first search result so the page is useful before JavaScript loads; the Explorer then takes over with `fetch('/api/search')`.

**PostgreSQL through Drizzle ORM with SQL migrations** (`drizzle/`). Production points `DATABASE_URL` at any Postgres (Neon recommended, see DEPLOYMENT.md). Locally and in tests the same schema runs on **PGlite**, an embedded Postgres, so `npm install && npm run dev` works with no services. The driver is chosen in `src/lib/db/client.ts`; nothing else knows which one is in use.

## Normalized program model

`src/lib/domain/program.ts` is the single zod schema every adapter must produce. Key choices:

- **Benefit types are distinct values** (`tax_credit`, `pos_rebate`, `post_purchase_rebate`, `rebate_timing_unknown`, `financing`, `rate_plan`, `bill_credit`, …) and are never summed. When a source does not say whether a rebate is paid at purchase or later, the record says `rebate_timing_unknown` rather than guessing.
- **Amounts carry evidence.** `amounts[]` entries are `flat | percent | per_unit | text`, and for curated records each has a verbatim `quote`, `url` and `retrievedAt`. AFDC amounts are free text in the source, so they are stored as `kind: "text"` quotes, labeled "stated in source", and never parsed into numbers.
- **Coverage is explicit and confidence-rated.** `coverage.type` ∈ national / state / county / municipality / zip / utility / other / unknown with `confidence` ∈ verified / source_stated / unverified and a human note. AFDC utility incentives are `utility` + `unverified` with a note that the service area was not verified; the UI shows a "Coverage not verified" tag. Nationwide and statewide programs are returned by the state filter and never get point markers.
- **Provider location ≠ eligible area.** `providerLocation` is a separate optional field, labeled as an office location in the UI.
- **Provenance fields** (`sourceUrl`, `retrievedAt`, `lastVerifiedAt`, `verificationMethod`, `evidence`, `uncertainties`, `statusBasis`) are required or defaulted, and the raw source payload is kept in `programs.raw_payload` for audit.
- **Status basis is a sentence**, e.g. "Listed by AFDC as a current incentive … funding availability was not confirmed." A fetched page is never treated as proof a program is active.

## Source adapters

Each adapter in `src/lib/sources/` exports `meta` (terms URL, attribution, required env vars, allowed hosts, coverage and gaps text, priority, stale window) and either `fetchAll()` (bulk/curated) or `query(location, sensitive)` (on demand). The registry (`registry.ts`) is the only list of adapters; the Coverage page, admin dashboard and search service derive everything from it.

- **Curated** (`curated.ts`): records in `data/curated/*.json` where every important value has a verbatim quote. On each run the adapter re-fetches the official page and checks each quote still appears; a missing quote adds a `REVIEW:` uncertainty, and the resulting material change queues a review item.
- **AFDC** (`afdc.ts`): one request per jurisdiction (US + 51), `technology=ELEC,PHEV`, incentives only, expired excluded. Categories are classified from title/text with documented regexes and the record says so in `uncertainties`. Provider names are extracted from the AFDC title suffix ("… - Utility Name") with a fallback that marks the provider as not extracted.
- **Rewiring America** (`rewiring-america.ts`): the API requires income/size/owner status, and its terms forbid caching beyond 24 h and systematic copying, so it is queried per ZIP and cached ≤ 24 h in `source_cache` under a key that hashes (salted) the sensitive inputs. When the user leaves income blank, a deliberately high placeholder is sent and results are labeled unscreened.
- **OpenEI URDB** (`openei.ts`): CC0 data, queried by lat/lon radius; only EV or TOU residential rates are kept and they are typed `rate_plan`, never rebates. Results may be persisted.

Adding a source = adding one file and one registry entry.

## Pipeline

`src/lib/pipeline/ingest.ts`:

- **Validation**: every record must pass the zod schema; failures are counted and listed on the run.
- **Change detection**: a content hash over material fields; unchanged records only refresh `retrievedAt`. Changes keep a snapshot in `program_revisions`. Changes to amounts, status, URLs, end date or coverage set `review_state = needs_review` and open a review item. The new values are stored, the record is left out of search results until an admin keeps or hides it (search returns only `published`), and its detail page, if opened directly, shows a "change awaiting review" notice.
- **Missing records** are never deleted. They get `source_unavailable_since` and a review item and stay visible with a warning.
- **Dedup** (`dedupe.ts`) only pairs records that share an official URL or provider+name within the same states, and refuses when amounts, benefit types or categories differ. Cross-source pairs become review items; at query time the higher-priority source is shown and the card says "also listed by another source".
- **Fixtures** are rejected unless the caller explicitly allows them (tests only).
- **Retries, rate limiting, SSRF protection** live in `src/lib/security/http.ts`: https only, allowlisted hosts per adapter, no IP literals, manual redirect re-validation, timeouts, size caps, exponential backoff on 429/5xx, per-host minimum interval, and query strings redacted from error messages so API keys never reach logs.
- **Link checks** (`linkcheck.ts`) HEAD/GET official URLs weekly; a URL is flagged broken after 3 consecutive failures.
- **Stale detection**: each source declares `staleAfterDays`; records older than that show "May be out of date".

## Search

`src/lib/search/service.ts` combines stored programs (national + selected state) with on-demand sources (when a ZIP is given), collapses duplicates, applies filters, evaluates eligibility and returns an **honest empty reason**: `no_location`, `no_matches`, `incomplete_coverage` (a source is not configured), `source_unavailable`, `filters_too_restrictive`, `unsupported_area`.

`src/lib/eligibility/evaluate.ts` produces one of four verdicts per program and lists what is missing; a program with only text-based income rules can never be "verified". Vehicle checks only apply rules a source publishes; without a per-model list the entered vehicle is explicitly not checked.

## Map

MapLibre draws the states from `public/geo/states.json`, which is the Census boundary set projected through d3's `geoAlbersUsa` (Alaska and Hawaii insets) and mapped into a small pseudo-lon/lat window so Web Mercator is effectively linear. Only drawing uses those coordinates. States are `fill-extrusion` polygons whose height follows the number of state/utility/local programs; hover and selection use feature state; DC gets an enlarged button. No tile server, glyph server or API key is contacted: the style is empty, labels are HTML markers, and the browser CSP has `connect-src 'self'`.

Programs tied to the searched ZIP are drawn at the search point with a manual cluster (one count bubble when zoomed out, a spiral of category icons when zoomed in), and the hint and marker titles say the marker is the search location, not a provider office.

Without WebGL the Explorer renders `UsMapFallback`, an SVG map where every state is a focusable button, and the list is always the complete browsing path.

## Privacy and security

- Two schemas (`shareableSchema`, `sensitiveSchema`) make it structurally impossible to put income or vehicle data in a URL; `redactForLog` strips them from logs.
- Sensitive values are read from the POST body, used once, never stored. Cache keys hash them with `CACHE_SALT`.
- Admin: scrypt password hash, HMAC-signed httpOnly `SameSite=strict` cookie scoped to `/admin`, per-IP login throttling. Cron routes require `Authorization: Bearer CRON_SECRET` with constant-time comparison.
- All source HTML is sanitized (`sanitize-html`, https links only) before storage and rendering. Security headers and a CSP are set in `next.config.ts`.
