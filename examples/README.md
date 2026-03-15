# GeoStability API – Examples

Base URL: `https://geostability.com` (or `http://localhost:3000` for local). Set `API_BASE_URL` and optionally `API_KEY` in the environment or edit the scripts.

## curl

```bash
# Anonymous (rate-limited)
curl -s "${API_BASE_URL:-https://geostability.com}/api/events?limit=5" | jq .

# With API key
curl -s "${API_BASE_URL:-https://geostability.com}/api/events?limit=5" \
  -H "X-API-Key: ${API_KEY:-yourkey}" | jq .

# Clusters (heat-map)
curl -s "${API_BASE_URL:-https://geostability.com}/api/clusters?timeline=7d&resolution=medium" | jq .
```

See also `curl.sh`.
