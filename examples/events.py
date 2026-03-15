#!/usr/bin/env python3
"""
GeoStability API – Python (requests)
Run: pip install requests && python events.py
Env: API_BASE_URL (default https://geostability.com), API_KEY (optional)
"""

import os
import sys

try:
    import requests
except ImportError:
    print("pip install requests", file=sys.stderr)
    sys.exit(1)

BASE = os.environ.get("API_BASE_URL", "https://geostability.com")
API_KEY = os.environ.get("API_KEY", "")

def main():
    headers = {}
    if API_KEY:
        headers["X-API-Key"] = API_KEY

    print("GET /api/events?limit=5")
    r = requests.get(f"{BASE}/api/events", params={"limit": 5}, headers=headers)
    r.raise_for_status()
    data = r.json()
    print("total:", data.get("total"), "data length:", len(data.get("data", [])))
    if data.get("data"):
        first = data["data"][0]
        print("first:", first.get("id"), first.get("title"), first.get("category"))

    print("\nGET /api/clusters?timeline=7d&resolution=medium")
    r2 = requests.get(
        f"{BASE}/api/clusters",
        params={"timeline": "7d", "resolution": "medium"},
        headers=headers,
    )
    r2.raise_for_status()
    clusters = r2.json()
    print("clusters count:", len(clusters) if isinstance(clusters, list) else 0)
    if isinstance(clusters, list) and clusters:
        b = clusters[0]
        print("first bucket:", b.get("lat"), b.get("lon"), b.get("count"))

if __name__ == "__main__":
    main()
