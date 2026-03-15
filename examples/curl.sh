#!/usr/bin/env bash
# GeoStability API – curl samples
# Usage: API_BASE_URL=https://geostability.com API_KEY=yourkey ./curl.sh

BASE="${API_BASE_URL:-https://geostability.com}"
KEY="${API_KEY:-}"

echo "=== GET /api/events (anonymous, limit=5) ==="
curl -s "${BASE}/api/events?limit=5" | head -c 500
echo -e "\n..."

echo -e "\n=== GET /api/events (with API key) ==="
if [ -n "$KEY" ]; then
  curl -s "${BASE}/api/events?limit=3" -H "X-API-Key: $KEY" | head -c 500
  echo -e "\n..."
else
  echo "Set API_KEY to use key."
fi

echo -e "\n=== GET /api/clusters (7d, medium) ==="
curl -s "${BASE}/api/clusters?timeline=7d&resolution=medium" | head -c 400
echo -e "\n..."
