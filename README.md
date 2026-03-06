# global-stability-mvp

Reference files and starter code for Global Stability MVP.

## Domain setup (geostability.com)

For production at **https://geostability.com**:

1. **Vercel** — Add the domain in Project → Settings → Domains. Set `NEXT_PUBLIC_APP_URL=https://geostability.com` and `APP_BASE_URL=https://geostability.com` in env vars (optional; production fallback uses geostability.com).
2. **Supabase** — Authentication → URL Configuration: set **Site URL** to `https://geostability.com` and add `https://geostability.com/**` to **Redirect URLs**.
3. **GitHub Actions** — Set `APP_BASE_URL` (or `INGEST_BASE_URL`) secret to `https://geostability.com` for ingest workflows.

## Feed ingestion

The app can ingest draft events from **RSS (or other) feeds**. Scripts fetch feeds, normalize items, and POST to the internal ingest API. The API dedupes by `source_url` in `ingestion_items` and creates **draft events only** (status `UnderReview`); nothing is auto-published.

### Environment variables

Set these in `.env.local` (and in CI/deploy for scheduled runs):

| Variable | Required | Description |
|----------|----------|-------------|
| `INGEST_API_KEY` | Yes | Secret key for the ingest API. Header `x-ingest-key` must match. Not exposed to the client. |
| `CRON_SECRET` | For cron | Secret for Vercel Cron routes. Header `x-cron-key` must match. Not exposed to the client. |
| `INGEST_BASE_URL` or `APP_BASE_URL` | No | Base URL of the app (default `http://localhost:3000`). Used by scripts and cron fallback. |
| `RELIEFWEB_RSS_URL` | For ReliefWeb | RSS feed URL for ReliefWeb (e.g. `https://reliefweb.int/updates/rss.xml`). |
| `GDACS_RSS_URL` | For GDACS | RSS feed URL for GDACS (e.g. `https://www.gdacs.org/gdacsrss.xml`). Required for cron and script. |
| `USGS_GEOJSON_URL` | For USGS | Optional. GeoJSON feed URL (default: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson`). Use `all_hour.geojson` for past hour. |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | For ReliefWeb | Required only for the ReliefWeb script (it writes to `ingestion_items` directly). GDACS uses the API only. |

### Ingest API

- **Endpoint**: `POST /api/internal/ingest`
- **Auth**: Header `x-ingest-key` must equal `INGEST_API_KEY`. If unset, the route returns 503.
- **Single draft (legacy)**: Body is one draft event (validated with `createDraftEventSchema`). Response: `201` + event.
- **Batch**: Body `{ "items": [ { "feed_key", "source_name", "source_url", "title", "summary?", "occurred_at?", "published_at?", "location?", "tags?", "raw?" }, ... ] }`. Dedupe by `source_url`; for each new item the API inserts into `ingestion_items` and creates a draft event (UnderReview). Response: `200` + `{ "processed", "skipped" }`.

### How to run the scripts

1. **Apply migrations** (including `ingestion_items` and `feed_key`): run the SQL in `migrations/` against your Supabase project (order by filename).

2. **Start the app** so the ingest endpoint is available:
   ```bash
   npm run dev
   ```

3. **Run a feed script**:
   ```bash
   npm run ingest:gdacs
   ```
   or
   ```bash
   npm run ingest:usgs
   ```
   or
   ```bash
   npm run ingest:reliefweb
   ```

   - **GDACS**: Fetches `GDACS_RSS_URL`, normalizes items (`feed_key: "gdacs_rss"`, `source_name: "GDACS"`), POSTs batch to `/api/internal/ingest`. Exits with code `0` on success, `1` on fetch/parse/API error. Logs if RSS returns HTML or 0 items.
   - **USGS**: Fetches USGS GeoJSON (all_day or all_hour; `USGS_GEOJSON_URL`), normalizes features (`feed_key: "usgs_eq"`, `source_name: "USGS"`, `source_url`, title, summary "M {mag} - {place}", `occurred_at` from time ms, `location` from geometry), POSTs batch to `/api/internal/ingest`.
   - **ReliefWeb**: Fetches `RELIEFWEB_RSS_URL`, dedupes via Supabase `ingestion_items`, inserts new rows, POSTs each new item to the ingest API, updates status. Requires Supabase env vars.

### Schedule ingestion with GitHub Actions

The workflow `.github/workflows/ingest.yml` runs **GDACS** ingestion every 30 minutes and can be triggered manually (`workflow_dispatch`).

**Required secrets** (Settings → Secrets and variables → Actions):

| Secret | Description |
|--------|-------------|
| `APP_BASE_URL` | Base URL of the deployed app (e.g. `https://geostability.com`). Used as `INGEST_BASE_URL` by the script. For local/manual runs you can use `http://localhost:3000` if the app is reachable. |
| `INGEST_API_KEY` | Same value as `INGEST_API_KEY` in your app environment. The ingest endpoint validates the `x-ingest-key` header against this. |
| `GDACS_RSS_URL` | RSS feed URL for GDACS (e.g. `https://www.gdacs.org/gdacsrss.xml`). |

Ensure the app is deployed and `INGEST_API_KEY` is set in the app's environment so the ingest endpoint accepts requests from the workflow.

For **ReliefWeb**, use or duplicate `.github/workflows/ingest-reliefweb.yml`; add secrets `INGEST_API_KEY`, `INGEST_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `RELIEFWEB_RSS_URL`.

### Vercel Cron

Cron routes run fetch+normalize in-process and POST to the internal ingest API. No shell-out.

- **`GET /api/cron/usgs`** — USGS earthquakes. Returns `{ fetched, processed, skipped, feed_key }`.
- **`GET /api/cron/gdacs`** — GDACS disasters. Requires `GDACS_RSS_URL`.

Each cron request **must** include the header `x-cron-key: <CRON_SECRET>` (or `Authorization: Bearer <CRON_SECRET>`). Without it, the route returns 401.

#### Deployment

1. **Environment variables** (Vercel Project → Settings → Environment Variables):

   | Variable | Required | Description |
   |----------|----------|-------------|
   | `CRON_SECRET` | Yes | Secret for cron auth. Generate with `openssl rand -hex 32`. Used as `x-cron-key` header value. |
   | `INGEST_API_KEY` | Yes | Secret for the ingest API. Must match `x-ingest-key` when cron POSTs to `/api/internal/ingest`. |
   | `GDACS_RSS_URL` | For GDACS | RSS feed URL (e.g. `https://www.gdacs.org/xml/rss.xml`). |
   | `APP_BASE_URL` | No | App URL for internal fetch (e.g. `https://geostability.com`). Defaults to request origin or `https://<VERCEL_URL>`. |
   | `NEXT_PUBLIC_APP_URL` | No | Canonical app URL for alert email links. Production default: `https://geostability.com`. |

2. **Cron schedules** — `vercel.json`:

   ```json
   {
     "crons": [
       { "path": "/api/cron/usgs", "schedule": "*/15 * * * *" },
       { "path": "/api/cron/gdacs", "schedule": "0 * * * *" }
     ]
   }
   ```

   - USGS: every 15 minutes
   - GDACS: every 60 minutes (hourly)

3. **Cron auth** — Configure your cron invoker to send `x-cron-key: <CRON_SECRET>` on each request. Vercel Cron may send `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is set; both are accepted.

#### Test locally with curl

```bash
# Start the app
npm run dev

# Run USGS cron (replace YOUR_CRON_SECRET with the value from .env.local)
curl -H "x-cron-key: YOUR_CRON_SECRET" "http://localhost:3000/api/cron/usgs"

# Run GDACS cron
curl -H "x-cron-key: YOUR_CRON_SECRET" "http://localhost:3000/api/cron/gdacs"
```

Expected response: `{ "fetched": N, "processed": P, "skipped": S, "feed_key": "usgs_eq" }` (or `gdacs_rss`).
