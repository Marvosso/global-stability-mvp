# GeoStability API

**Open wrapper over global crisis feeds.** Query ACLED, GDELT, USGS, GDACS and more in one place—armed conflict, natural disasters, humanitarian events—with clustering, confidence scoring, and basic geo filters.

- **Free tier:** 500 calls/month with an API key.
- **Endpoints:** Events (list/filter), Clusters (heat-map aggregation).
- **License:** [MIT](LICENSE).

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events` | List published events with filters. Paginated, supports category, country, date range, geo (lat/lon/radius). |
| GET | `/api/clusters` | Heat-map style aggregation: buckets with `lat`, `lon`, `count`, `avg_confidence`, `dominant_category`, `events_sample`. |

### GET /api/events

**Query params**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | int | 20 | Max 100. |
| `offset` | int | 0 | Pagination. |
| `since` | YYYY-MM-DD | — | Filter by `occurred_at >= since`. |
| `until` | YYYY-MM-DD | — | Filter by `occurred_at <= until`. |
| `category` | string | — | Comma-separated (e.g. `Armed Conflict`, `Natural Disaster`). |
| `country` | string | — | ISO country code (e.g. `UKR`). |
| `confidence` | string | — | `Medium` or `High`. |
| `lat`, `lon`, `radius_km` | number | — | All three required for geo filter (radius in km). |
| `full_summary` | bool | false | Pro/Enterprise: include full summary. |

**Response schema**

```json
{
  "data": [
    {
      "id": "uuid",
      "title": "string",
      "category": "string",
      "subtype": "string | null",
      "severity": "string",
      "confidence": "string | null",
      "occurred_at": "ISO8601 | null",
      "lat": "number | null",
      "lon": "number | null",
      "sources": [{ "name": "string", "url": "string | null" }],
      "summary": "string | null"
    }
  ],
  "total": "number",
  "next_offset": "number | null"
}
```

### GET /api/clusters

**Query params**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `timeline` | string | `7d` | `7d` or `30d` (events in last N days). |
| `resolution` | string | `medium` | `coarse`, `medium`, or `fine` (grid size). |
| `category` | string | — | Optional filter by category. |

**Response:** Array of `{ lat, lon, count, avg_confidence, dominant_category, events_sample }` where `events_sample` is up to 3 event IDs.

## Auth & credits

- **Anonymous:** No key; rate limit 100 requests/IP/hour. No credits tracked.
- **API key:** Send `X-API-Key: <key>` or `Authorization: Bearer <key>`. Keys are created after sign-up via **POST /api/keys/generate** (Supabase session required).
- **Credits:** 1 credit per call when using a key. Free tier: 500 credits/month, reset monthly. When credits are exhausted you get `402 Payment Required`.
- **Tiers:** Free (500/mo), Pro ($9/mo, unlimited basic), Enterprise (contact). Premium params (e.g. `full_summary=true`) require Pro or Enterprise.

## Setup

### Environment variables (Supabase)

Create `.env.local` (and set the same in Vercel/hosting):

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key (client auth). |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-only; API and DB). |

Optional for cron/ingest: `CRON_SECRET`, `INGEST_API_KEY`, feed URLs (e.g. `GDACS_RSS_URL`, `USGS_GEOJSON_URL`). See existing README sections or repo for ingest and cron.

### Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). API base: `http://localhost:3000`.

### Database

Run the SQL migrations in `migrations/` in order against your Supabase project (Supabase SQL editor or CLI).

## Examples

See the **[examples](examples/)** folder:

- **curl** — `examples/curl.sh` (or inline in `examples/README.md`)
- **Node (node-fetch)** — `examples/events-node.mjs`
- **Python (requests)** — `examples/events.py`

Quick curl:

```bash
# List events (anonymous; rate-limited)
curl 'https://geostability.com/api/events?limit=10&category=Armed%20Conflict'

# With API key (uses credits)
curl 'https://geostability.com/api/events?limit=10' -H 'X-API-Key: YOUR_KEY'

# Clusters (heat-map data)
curl 'https://geostability.com/api/clusters?timeline=7d&resolution=medium'
```

Replace `https://geostability.com` with your deployment URL or `http://localhost:3000` for local.

## Deploy (Vercel)

1. Connect the repo to [Vercel](https://vercel.com); Vercel will create preview deployments for PRs.
2. Add the Supabase env vars in Project → Settings → Environment Variables.
3. Optional: set `CRON_SECRET`, `INGEST_API_KEY`, and feed URLs if you use cron/ingest.

A GitHub Actions workflow (`.github/workflows/vercel-preview.yml`) runs `npm ci && npm run build` on push/PR to verify the app builds; preview URLs are created by Vercel when the repo is linked.

## License

MIT. See [LICENSE](LICENSE).
