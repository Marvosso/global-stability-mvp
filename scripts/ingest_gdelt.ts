/**
 * GDELT ingestion script.
 * Fetches from GDELT Events API (v2), normalizes to ingest format, POSTs to /api/internal/ingest.
 *
 * Env:
 * - INGEST_API_KEY — required for POST to ingest API
 * - INGEST_BASE_URL or APP_BASE_URL — optional, default http://localhost:3000
 */

import "dotenv/config";
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
config({ path: path.join(projectRoot, ".env.local") });

const GDELT_EVENTS_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
const SOURCE_NAME = "GDELT";
const MAX_RECORDS = 50;
const QUERY = "(protest OR conflict OR violence)";

type IngestItem = {
  feed_key: string;
  source_name: string;
  source_url: string;
  title: string;
  summary?: string;
  published_at?: string;
  occurred_at?: string;
  location?: string;
};

function isValidUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

function normalizeEvent(raw: Record<string, unknown>, feedKey: string): IngestItem | null {
  const articleUrl =
    (raw.article_url ?? raw.url ?? raw.source_url ?? "").toString().trim();
  if (!articleUrl || !isValidUrl(articleUrl)) return null;

  const title = (raw.title ?? "").toString().trim() || articleUrl.slice(0, 500) || "GDELT event";
  const seendate = (
    raw.seendate ??
    raw.date ??
    raw.dateadded ??
    raw.date_added ??
    ""
  ).toString().trim();

  const latRaw = raw.latitude ?? raw.lat;
  const lngRaw = raw.longitude ?? raw.lng;
  const lat =
    typeof latRaw === "number" && Number.isFinite(latRaw)
      ? latRaw
      : typeof latRaw === "string"
        ? parseFloat(latRaw)
        : NaN;
  const lng =
    typeof lngRaw === "number" && Number.isFinite(lngRaw)
      ? lngRaw
      : typeof lngRaw === "string"
        ? parseFloat(lngRaw)
        : NaN;
  const location =
    Number.isFinite(lat) && Number.isFinite(lng) ? `${lat},${lng}`.slice(0, 500) : undefined;

  return {
    feed_key: feedKey,
    source_name: SOURCE_NAME,
    source_url: articleUrl,
    title: title.slice(0, 500),
    summary: title.slice(0, 5000) || undefined,
    published_at: seendate || undefined,
    occurred_at: seendate || undefined,
    location,
  };
}

async function fetchGdeltEvents(): Promise<Record<string, unknown>[]> {
  const url = new URL(GDELT_EVENTS_URL);
  url.searchParams.set("query", QUERY);
  url.searchParams.set("format", "json");
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("maxrecords", String(MAX_RECORDS));
  url.searchParams.set("timespan", "1week");

  const res = await fetch(url.toString(), { method: "GET" });
  const resText = await res.text();

  if (!res.ok) {
    console.error(`[GDELT] Fetch failed: ${res.status} ${res.statusText}`);
    console.error(`[GDELT] Response body: ${resText.slice(0, 500)}`);
    throw new Error(`GDELT fetch failed: ${res.status} ${res.statusText}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(resText);
  } catch {
    console.error("[GDELT] Response was not valid JSON:", resText.slice(0, 300));
    throw new Error("GDELT response was not valid JSON.");
  }

  if (Array.isArray(json)) return json as Record<string, unknown>[];
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as Record<string, unknown>[];
    if (Array.isArray(obj.articles)) return obj.articles as Record<string, unknown>[];
    if (Array.isArray(obj.events)) return obj.events as Record<string, unknown>[];
  }
  return [];
}

export type RunIngestResult = { fetched: number; processed: number; skipped: number };

export async function runIngest(): Promise<RunIngestResult | null> {
  const { getFeedConfig, updateFeedLastRun } = await import("@/lib/feeds/getFeedConfig");
  const feedConfig = await getFeedConfig("gdelt");
  if (!feedConfig || !feedConfig.enabled) return null;
  const feedKey = feedConfig.feed_key;

  const ingestKey = (process.env.INGEST_API_KEY ?? "").trim();
  if (!ingestKey) throw new Error("INGEST_API_KEY is required to POST to the ingest API. Set it in .env.local.");

  const ingestBaseUrl =
    (process.env.INGEST_BASE_URL ?? process.env.APP_BASE_URL ?? "http://localhost:3000")
      .trim()
      .replace(/\/$/, "") || "http://localhost:3000";

  const rawEvents = await fetchGdeltEvents();
  const items = rawEvents
    .map((raw) => normalizeEvent(raw, feedKey))
    .filter((x): x is IngestItem => x !== null);

  if (items.length === 0) return { fetched: 0, processed: 0, skipped: 0 };

  const ingestUrl = `${ingestBaseUrl}/api/internal/ingest`;
  const res = await fetch(ingestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-ingest-key": ingestKey },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ingest API failed: ${res.status} ${res.statusText} ${text.slice(0, 300)}`);
  }
  const result = (await res.json()) as { processed?: number; skipped?: number };
  await updateFeedLastRun("gdelt");
  return {
    fetched: items.length,
    processed: result.processed ?? 0,
    skipped: result.skipped ?? 0,
  };
}

async function main(): Promise<number> {
  try {
    const result = await runIngest();
    if (result == null) {
      console.log("Feed gdelt is disabled in registry.");
      return 0;
    }
    console.log(
      `GDELT: fetched ${result.fetched} items. Processed: ${result.processed}, Skipped: ${result.skipped}`
    );
    return 0;
  } catch (err) {
    console.error("Failed to fetch GDELT data:", err);
    return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
