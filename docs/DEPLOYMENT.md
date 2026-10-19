# Hosting and deployment

## Recommended platform: Vercel + Neon Postgres

**Why:** the app is a Next.js server-rendered site with JSON routes and two scheduled jobs. Vercel runs Next.js natively, supports Cron Jobs that call `/api/cron/refresh` and `/api/cron/linkcheck` with `CRON_SECRET`, and needs no container or server to maintain. Neon is serverless Postgres with a connection string that works with the `pg` driver used here. Both have free tiers suitable for a pilot.

**Required services:** Vercel project, Neon database, the API keys in `.env.example`.

**Limitations to check before launch:**
- Vercel function duration: the AFDC full refresh makes 52 sequential requests with a 1 s minimum interval (about 1–2 minutes). `maxDuration = 300` is set on the cron routes, which needs a plan that allows 300 s functions (Hobby allows 60 s by default at the time of writing; verify current limits and pricing). If limited, run `npm run ingest` from GitHub Actions instead (see below).
- Vercel Cron frequency on the Hobby plan may be limited to once per day; daily is what `vercel.json` requests.
- Neon free tier: compute auto-suspends; the first request after idle is slower. Pool size is `DATABASE_POOL_MAX` (default 5).
- Costs: Vercel Pro and Neon paid tiers if traffic or function limits require; confirm current prices on both sites before launch. No other paid services are used.

**Alternatives:** any Node host (Render, Fly.io, Railway, a VM) running `npm run build && npm start` with Postgres, and a system cron or GitHub Actions calling the cron endpoints or `npm run ingest`.

## Environment variables

See `.env.example`. All are server-side. Nothing in the browser bundle contains a key (verified: `connect-src 'self'` in the CSP; the browser only talks to this app).

## Steps

1. Create a Neon database; copy its connection string into `DATABASE_URL` (Vercel → Project → Settings → Environment Variables).
2. Set `NREL_API_KEY`, `REWIRING_AMERICA_API_KEY`, `CRON_SECRET` (random, 16+ chars), `CACHE_SALT` (random), `ADMIN_SESSION_SECRET` (random, 32+ chars), `ADMIN_PASSWORD_HASH` (`npm run admin:hash -- 'password'`).
3. Run migrations once: locally `DATABASE_URL=… npm run db:migrate`, or set `AUTO_MIGRATE=true` so the first request migrates.
4. Deploy (`vercel` CLI or Git integration). `vercel.json` registers the two cron jobs; Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set.
5. Run the first ingestion: `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/refresh`, or `DATABASE_URL=… npm run ingest` locally.
6. Sign in at `/admin` and check the dashboard (sources configured, run status, review queue).

## Refresh from GitHub Actions (optional, avoids function limits)

```yaml
name: refresh
on:
  schedule: [{ cron: "0 6 * * *" }]
  workflow_dispatch:
jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run ingest && npm run linkcheck
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          NREL_API_KEY: ${{ secrets.NREL_API_KEY }}
```

## Not done in this session

Nothing was deployed, purchased or configured externally. The steps above are documented, not executed.
