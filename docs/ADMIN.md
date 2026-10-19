# Administrative workflow

The admin interface lives at `/admin` and is disabled until `ADMIN_PASSWORD_HASH` and `ADMIN_SESSION_SECRET` are set. Sessions are 8-hour signed cookies; five failed logins per IP lock login for 15 minutes.

## Pages

- **Dashboard** (`/admin`): per-source configuration state, published / needs-review / hidden counts, stale counts, last success, consecutive failures and last error; "Run now" for bulk sources; "Run link check".
- **Review queue** (`/admin/review`): open items with their reason and details:
  - `material_change` — amount, status, URL, end date or coverage changed; the record is withheld from search until resolved.
  - `missing_from_source` — the source stopped returning the record; it stays visible with a warning.
  - `possible_duplicate` — a cross-source pair sharing an official URL or provider+name with the same stated benefit.
  - `broken_link` — the official link failed three consecutive checks.
  - `REVIEW:` uncertainties on curated records mean a verbatim quote no longer appears on the official page.
  Actions: **Keep** (publish as is), **Hide** (reject; hidden from users, not deleted), **Mark closed** (publish with status closed and an admin status basis).
- **Ingestion runs** (`/admin/runs`): every run with trigger, status, counts and notes (warnings, rejected records with reasons).

## Correcting a record

For curated records, edit `data/curated/*.json` (with a verbatim quote and URL for each changed value) and run `npm run ingest -- --only federal_curated`. For source-derived records, use Hide / Mark closed from the review queue; manual field edits are intentionally not offered so stored values always trace back to a source.

## Command-line equivalents

```bash
npm run ingest                      # all configured bulk sources
npm run ingest -- --only afdc
npm run linkcheck
```

Both record rows in `ingestion_runs` / `link_checks` exactly like the scheduled endpoints.
