/**
 * GeoStability API – Node (native fetch)
 * Run: node events-node.mjs
 * Env: API_BASE_URL (default https://geostability.com), API_KEY (optional)
 */

const BASE = process.env.API_BASE_URL || "https://geostability.com";
const API_KEY = process.env.API_KEY || "";

async function main() {
  const headers = {};
  if (API_KEY) headers["X-API-Key"] = API_KEY;

  console.log("GET /api/events?limit=5");
  const eventsRes = await fetch(`${BASE}/api/events?limit=5`, { headers });
  if (!eventsRes.ok) {
    console.error("Events error", eventsRes.status, await eventsRes.text());
    return;
  }
  const events = await eventsRes.json();
  console.log("total:", events.total, "data length:", events.data?.length);
  if (events.data?.[0]) {
    console.log("first:", events.data[0].id, events.data[0].title, events.data[0].category);
  }

  console.log("\nGET /api/clusters?timeline=7d&resolution=medium");
  const clustersRes = await fetch(`${BASE}/api/clusters?timeline=7d&resolution=medium`, { headers });
  if (!clustersRes.ok) {
    console.error("Clusters error", clustersRes.status, await clustersRes.text());
    return;
  }
  const clusters = await clustersRes.json();
  console.log("clusters count:", Array.isArray(clusters) ? clusters.length : 0);
  if (Array.isArray(clusters) && clusters[0]) {
    console.log("first bucket:", clusters[0].lat, clusters[0].lon, clusters[0].count);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
