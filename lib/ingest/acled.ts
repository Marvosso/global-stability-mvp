/**
 * ACLED API ingestion (free myACLED endpoint).
 * Auth: ACLED_API_KEY (Bearer) or ACLED_EMAIL + ACLED_PASSWORD (OAuth).
 * Filter: iso3 in UKR, ISR, IRN, PSE or event_type contains 'conflict'. Last 7 days.
 * Normalize: title, lat/lon, occurred_at, category='Armed Conflict', feed_key='acled'. POST to /api/internal/ingest.
 * Auto-publish: status Published, confidence High.
 */

import type { IngestItem } from "@/app/api/_lib/validation";
import { processIngestBatch } from "@/app/api/_lib/processIngestBatch";

const FEED_KEY = "acled";
const SOURCE_NAME = "ACLED";
const BASE_URL = "https://acleddata.com/api/acled/read";
const HIGH_RELEVANCE_ISO3 = new Set(["UKR", "ISR", "IRN", "PSE"]);
const COUNTRY_NAMES = "Ukraine|Israel|Iran|Palestine|State of Palestine";
const DEFAULT_DAYS = 7;
const LIMIT = 500;

const log = {
  error: (msg: string, meta?: Record<string, unknown>) => console.error(msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(msg, meta),
};

type AcledEvent = {
  event_id_cnty?: string;
  event_date?: string;
  event_type?: string;
  sub_event_type?: string;
  actor1?: string;
  actor2?: string;
  country?: string;
  iso?: number | string;
  admin1?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  fatalities?: number;
  source?: string;
  notes?: string;
  [key: string]: unknown;
};

const ISO3_BY_COUNTRY: Record<string, string> = {
  ukraine: "UKR",
  israel: "ISR",
  "iran (islamic republic of)": "IRN",
  iran: "IRN",
  palestine: "PSE",
  "state of palestine": "PSE",
};

const ISO_NUMERIC_TO_ISO3: Record<number, string> = {
  804: "UKR",
  376: "ISR",
  364: "IRN",
  275: "PSE",
};

type AcledResponse = {
  data?: AcledEvent[];
  count?: number;
  [key: string]: unknown;
};

/**
 * Get ACLED OAuth access token using email/password (myACLED credentials).
 * ACLED expects application/x-www-form-urlencoded and client_id=acled.
 * See: https://acleddata.com/api-authentication and
 * https://dtacled.github.io/acledR/articles/acled_api.html
 */
async function getAcledToken(): Promise<string | null> {
  const email = (
    process.env.ACLED_EMAIL ??
    process.env.ACLED_EMAIL_ADDRESS ??
    process.env.email_address
  )?.trim();
  const pass = (
    process.env.ACLED_PASSWORD ??
    process.env.acled_password
  )?.trim();
  if (!email || !pass) return null;

  const body = new URLSearchParams({
    grant_type: "password",
    client_id: process.env.ACLED_CLIENT_ID ?? "acled",
    username: email,
    password: pass,
  });

  try {
    const res = await fetch("https://acleddata.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      log.warn("[acled] OAuth token request failed", { status: res.status, body: text.slice(0, 200) });
      return null;
    }
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch (err) {
    log.warn("[acled] OAuth token request error", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

function getAccessToken(): string | null {
  const key = process.env.ACLED_API_KEY?.trim();
  if (key) return key;
  const token = process.env.ACLED_ACCESS_TOKEN?.trim();
  if (token) return token;
  return null;
}

/** Fetch ACLED events (last 7 days). Filter: iso3 in UKR/ISR/IRN/PSE or event_type contains 'conflict'. */
async function fetchAcledEvents(token: string): Promise<AcledEvent[]> {
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - DEFAULT_DAYS);
  const fromStr = fromDate.toISOString().slice(0, 10);
  const toStr = toDate.toISOString().slice(0, 10);

  const url = new URL(BASE_URL);
  url.searchParams.set("_format", "json");
  url.searchParams.set("country", COUNTRY_NAMES);
  url.searchParams.set("event_date", `${fromStr}|${toStr}`);
  url.searchParams.set("event_date_where", "BETWEEN");
  url.searchParams.set("limit", String(LIMIT));

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "globalstability-mvp/1.0",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ACLED API error: ${res.status} ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as AcledResponse;
  const data = Array.isArray(json.data) ? json.data : [];

  const highRelevance = data.filter((ev) => {
    let iso3: string | null = null;
    if (ev.iso != null) {
      const n = typeof ev.iso === "number" ? ev.iso : parseInt(String(ev.iso), 10);
      iso3 = Number.isFinite(n) ? (ISO_NUMERIC_TO_ISO3[n] ?? null) : String(ev.iso).toUpperCase().slice(0, 3) || null;
    }
    const countryNorm = (ev.country ?? "").toString().trim().toLowerCase();
    const isoFromCountry = countryNorm ? ISO3_BY_COUNTRY[countryNorm] ?? null : null;
    const inRegion =
      (iso3 != null && HIGH_RELEVANCE_ISO3.has(iso3)) ||
      (isoFromCountry != null && HIGH_RELEVANCE_ISO3.has(isoFromCountry));
    const eventType = (ev.event_type ?? "").toString().toLowerCase();
    const isConflict = eventType.includes("conflict");
    return inRegion || isConflict;
  });

  return highRelevance;
}

function acledEventToIngestItem(ev: AcledEvent): IngestItem {
  const eventId = String(ev.event_id_cnty ?? "").trim() || crypto.randomUUID();
  const title =
    [ev.actor1, ev.actor2, ev.event_type, ev.sub_event_type].filter(Boolean).join(" / ") ||
    ev.event_type ||
    "ACLED conflict event";
  const summary = [ev.notes, ev.source].filter(Boolean).join(" — ") || title;
  const eventDate = ev.event_date ?? new Date().toISOString().slice(0, 10);
  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(eventDate)
    ? `${eventDate}T12:00:00.000Z`
    : eventDate;

  let location: string | undefined;
  const lat = typeof ev.latitude === "number" ? ev.latitude : Number(ev.latitude);
  const lon = typeof ev.longitude === "number" ? ev.longitude : Number(ev.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
    location = `${lat},${lon}`;
  } else if (ev.admin1 || ev.location || ev.country) {
    location = [ev.location, ev.admin1, ev.country].filter(Boolean).join(", ");
  }

  const sourceUrl = `https://acleddata.com/data/entry/${encodeURIComponent(eventId)}`;

  return {
    feed_key: FEED_KEY,
    source_name: SOURCE_NAME,
    source_url: sourceUrl,
    title: title.slice(0, 500),
    summary: summary.slice(0, 5000),
    occurred_at: isoDate,
    published_at: isoDate,
    location,
    category: "Armed Conflict",
    subtype: mapAcledSubEventType(ev.sub_event_type),
    raw: ev,
  };
}

type ArmedConflictSubtype = "Battle" | "Targeted Assassination" | "Air Strike" | "Border Skirmish";

/** Map ACLED sub_event_type to our subtype (Battle, Air Strike, etc.). */
function mapAcledSubEventType(sub?: string): ArmedConflictSubtype {
  if (!sub) return "Battle";
  const lower = sub.toLowerCase();
  if (lower.includes("air") || lower.includes("strike") || lower.includes("bombing")) return "Air Strike";
  if (lower.includes("assassination") || lower.includes("targeted")) return "Targeted Assassination";
  if (lower.includes("border") || lower.includes("skirmish")) return "Border Skirmish";
  return "Battle";
}

export type IngestACLEDOptions = {
  /** Override token (else uses ACLED_ACCESS_TOKEN or OAuth). */
  token?: string;
  /** Number of days back (default 7). */
  days?: number;
  /** Use batch POST to /api/internal/ingest when INGEST_BASE_URL + INGEST_API_KEY set. */
  useBatchIngest?: boolean;
};

export async function ingestACLED(
  options: IngestACLEDOptions = {}
): Promise<{ fetched: number; processed: number; skipped: number }> {
  let token = options.token ?? getAccessToken();
  if (!token) {
    token = await getAcledToken();
  }
  if (!token) {
    log.warn(
      "[acled] No ACLED token. Set ACLED_API_KEY or ACLED_EMAIL + ACLED_PASSWORD (myACLED) in .env; skipping"
    );
    return { fetched: 0, processed: 0, skipped: 0 };
  }

  let events: AcledEvent[];
  try {
    events = await fetchAcledEvents(token);
  } catch (err) {
    log.error("[acled] ACLED API fetch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  const ingestItems = events.map(acledEventToIngestItem);

  if (ingestItems.length === 0) {
    return { fetched: 0, processed: 0, skipped: 0 };
  }

  const useBatchIngest =
    options.useBatchIngest ??
    (Boolean(process.env.INGEST_BASE_URL?.trim()) && Boolean(process.env.INGEST_API_KEY?.trim()));

  if (useBatchIngest && process.env.INGEST_BASE_URL && process.env.INGEST_API_KEY) {
    const baseUrl = process.env.INGEST_BASE_URL.replace(/\/$/, "");
    try {
      const res = await fetch(`${baseUrl}/api/internal/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ingest-key": process.env.INGEST_API_KEY,
        },
        body: JSON.stringify({ items: ingestItems }),
      });
      const body = (await res.json().catch(() => ({}))) as { processed?: number; skipped?: number };
      if (!res.ok) {
        log.error("[acled] batch ingest failed", { status: res.status });
        return { fetched: ingestItems.length, processed: 0, skipped: ingestItems.length };
      }
      return {
        fetched: ingestItems.length,
        processed: body.processed ?? 0,
        skipped: body.skipped ?? 0,
      };
    } catch (err) {
      log.error("[acled] batch ingest request failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  const { processed, skipped } = await processIngestBatch(FEED_KEY, ingestItems, log);
  return { fetched: ingestItems.length, processed, skipped };
}
