/**
 * ACLED ingestion script (Phase 9A).
 * Uses OAuth (password grant) with myACLED credentials, fetches ACLED API data,
 * normalizes to ingest format, POSTs to /api/internal/ingest.
 *
 * Env:
 * - ACLED_EMAIL or ACLED_USERNAME — myACLED account email
 * - ACLED_PASSWORD — myACLED account password
 * - ACLED_BASE_URL — optional, default https://acleddata.com
 * - INGEST_API_KEY — required for POST to ingest API
 * - INGEST_BASE_URL or APP_BASE_URL — ingest API base URL
 * - ACLED_DAYS — optional, number of days to fetch (default 7)
 */

import "dotenv/config";
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
config({ path: path.join(projectRoot, ".env.local") });

const FEED_KEY = "acled";
const SOURCE_NAME = "ACLED";
const DEFAULT_ACLED_BASE_URL = "https://acleddata.com";
const DEFAULT_DAYS = 7;

type AcledEvent = {
  event_id_cnty?: string;
  event_date?: string;
  event_type?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  notes?: string;
  [key: string]: unknown;
};

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

function getAcledBaseUrl(): string {
  const base = (process.env.ACLED_BASE_URL ?? DEFAULT_ACLED_BASE_URL).trim().replace(/\/$/, "");
  return base || DEFAULT_ACLED_BASE_URL;
}

function formatDateYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function normalizeEvent(ev: AcledEvent, exploreBaseUrl: string): IngestItem | null {
  const eventId = (ev.event_id_cnty ?? "").toString().trim();
  if (!eventId) return null;

  const eventType = (ev.event_type ?? "Event").toString().trim();
  const locName = (ev.location ?? "").toString().trim();
  const title = locName ? `${eventType} - ${locName}` : eventType;
  const sourceUrl = `${exploreBaseUrl}/explore?event_id_cnty=${encodeURIComponent(eventId)}`;

  const summary = (ev.notes ?? "").toString().trim().slice(0, 5000) || title.slice(0, 500);
  const eventDate = (ev.event_date ?? "").toString().trim();
  const lat = ev.latitude;
  const lng = ev.longitude;
  const location =
    typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)
      ? `${lat},${lng}`
      : undefined;

  return {
    feed_key: FEED_KEY,
    source_name: SOURCE_NAME,
    source_url: sourceUrl,
    title: title.slice(0, 500),
    summary: summary || undefined,
    published_at: eventDate || undefined,
    occurred_at: eventDate || undefined,
    location: location?.slice(0, 500),
  };
}

async function fetchAcledAccessToken(baseUrl: string): Promise<string> {
  const email =
    (process.env.ACLED_EMAIL ?? process.env.ACLED_USERNAME ?? "").trim();
  const password = (process.env.ACLED_PASSWORD ?? "").trim();
  if (!email || !password) {
    throw new Error(
      "ACLED_EMAIL (or ACLED_USERNAME) and ACLED_PASSWORD are required in .env.local."
    );
  }

  const tokenUrl = `${baseUrl}/oauth/token`;
  const body = new URLSearchParams({
    grant_type: "password",
    username: email,
    password,
    client_id: "acled",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const resText = await res.text();
  if (!res.ok) {
    console.error(`[ACLED] Token fetch failed: ${res.status} ${res.statusText}`);
    console.error(`[ACLED] Response body (password redacted): ${resText.slice(0, 500)}`);
    throw new Error(`ACLED token fetch failed: ${res.status} ${res.statusText}`);
  }

  let json: { access_token?: string };
  try {
    json = JSON.parse(resText) as { access_token?: string };
  } catch {
    console.error("[ACLED] Token response was not valid JSON:", resText.slice(0, 300));
    throw new Error("ACLED token response was not valid JSON.");
  }
  if (!json.access_token) {
    console.error("[ACLED] Token response missing access_token. Body:", resText.slice(0, 300));
    throw new Error("ACLED token response missing access_token.");
  }
  return json.access_token;
}

async function fetchAcledEvents(
  baseUrl: string,
  accessToken: string,
  daysBack: number
): Promise<AcledEvent[]> {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - daysBack);
  const startStr = formatDateYMD(start);
  const endStr = formatDateYMD(today);

  const url = new URL(`${baseUrl}/api/acled/read`);
  url.searchParams.set("_format", "json");
  url.searchParams.set("event_date", `${startStr}|${endStr}`);
  url.searchParams.set("event_date_where", "BETWEEN");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  const resText = await res.text();
  if (!res.ok) {
    console.error(`[ACLED] Data fetch failed: ${res.status} ${res.statusText}`);
    console.error(`[ACLED] Response body: ${resText.slice(0, 500)}`);
    throw new Error(`ACLED data fetch failed: ${res.status} ${res.statusText}`);
  }

  let json: { data?: AcledEvent[] | { data?: AcledEvent[] }; count?: number };
  try {
    json = JSON.parse(resText) as { data?: AcledEvent[] | { data?: AcledEvent[] }; count?: number };
  } catch {
    console.error("[ACLED] Data response was not valid JSON:", resText.slice(0, 300));
    throw new Error("ACLED data response was not valid JSON.");
  }
  const data = Array.isArray(json?.data) ? json.data : (json?.data as { data?: AcledEvent[] })?.data;
  return Array.isArray(data) ? data : [];
}

async function main(): Promise<number> {
  const ingestKey = (process.env.INGEST_API_KEY ?? "").trim();
  if (!ingestKey) {
    console.error("INGEST_API_KEY is required to POST to the ingest API. Set it in .env.local.");
    return 1;
  }

  const baseUrl = getAcledBaseUrl();
  const ingestBaseUrl =
    (process.env.INGEST_BASE_URL ?? process.env.APP_BASE_URL ?? "http://localhost:3000")
      .trim()
      .replace(/\/$/, "") || "http://localhost:3000";

  const daysBack = Math.min(
    Math.max(1, parseInt(process.env.ACLED_DAYS ?? String(DEFAULT_DAYS), 10) || DEFAULT_DAYS),
    365
  );

  let accessToken: string;
  try {
    accessToken = await fetchAcledAccessToken(baseUrl);
  } catch (err) {
    console.error("Failed to obtain ACLED access token:", err);
    return 1;
  }

  let events: AcledEvent[];
  try {
    events = await fetchAcledEvents(baseUrl, accessToken, daysBack);
  } catch (err) {
    console.error("Failed to fetch ACLED data:", err);
    return 1;
  }

  const exploreBaseUrl = baseUrl.replace(/\/$/, "");
  const items = events
    .map((ev) => normalizeEvent(ev, exploreBaseUrl))
    .filter((x): x is IngestItem => x !== null);

  if (items.length === 0) {
    console.log("No ACLED events to ingest for the selected date range.");
    return 0;
  }

  const ingestUrl = `${ingestBaseUrl}/api/internal/ingest`;
  const res = await fetch(ingestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ingest-key": ingestKey,
    },
    body: JSON.stringify({ items }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Ingest API failed: ${res.status} ${res.statusText} ${text.slice(0, 300)}`);
    return 1;
  }

  const result = (await res.json()) as { processed?: number; skipped?: number };
  console.log(
    `ACLED: fetched ${items.length} items (last ${daysBack} days). Processed: ${result.processed ?? 0}, Skipped: ${result.skipped ?? 0}`
  );
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
