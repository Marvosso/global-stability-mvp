/**
 * GDELT conflict-focused ingestion using the 15-minute update feed.
 * Fetches lastupdate.txt to get latest 15-min file, or falls back to daily export.
 * Filters for conflict: EventRootCode in [14–20] or GoldsteinScale <= -5 or actor keywords.
 * Category: 14–15 = Political Tension, 16–20 = Armed Conflict. Confidence Medium.
 * POSTs to /api/internal/ingest with feed_key gdelt_events. Max 200 rows, 30s fetch timeout.
 */

import AdmZip from "adm-zip";
import type { IngestItem } from "@/app/api/_lib/validation";
import { processIngestBatch } from "@/app/api/_lib/processIngestBatch";
import { getCountryCentroid, centroidToPrimaryLocation } from "@/lib/countryCentroids";
import { resolveTitleCentroidFallback } from "@/lib/geoResolve";

const FEED_KEY = "gdelt_events";
const SOURCE_NAME = "GDELT";
const BASE_URL_DAILY = "http://data.gdeltproject.org/events";
const BASE_URL_V2 = "https://data.gdeltproject.org/gdeltv2";
const LASTUPDATE_TXT = `${BASE_URL_V2}/lastupdate.txt`;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_ITEMS = 200;
const MIN_ITEMS = 10;
const CONFLICT_ACTOR_MENTIONS = ["ukraine", "russia", "iran", "israel", "gaza"];

// GDELT 1.0 export.CSV: tab-separated, no header (codebook column indices 0-based)
const IDX = {
  GlobaleventID: 0,
  SQLDATE: 1,
  Actor1Name: 6,
  Actor2Name: 16,
  EventCode: 30,
  EventRootCode: 32,
  GoldsteinScale: 34,
  NumMentions: 35,
  Actor1Geo_Lat: 52,
  Actor1Geo_Long: 53,
  ActionGeo_CountryCode: 54,
  ActionGeo_Lat: 55,
  ActionGeo_Long: 56,
} as const;

const log = {
  error: (msg: string, meta?: Record<string, unknown>) => console.error(msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(msg, meta),
};

function parseRow(line: string): string[] {
  return line.split("\t");
}

function getCol(row: string[], i: number): string {
  const v = row[i];
  return typeof v === "string" ? v.trim() : "";
}

function parseNum(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Try GDELT Actor2 geo columns (layout varies slightly by export). */
function pickActor2LatLon(row: string[]): { lat: number; lng: number } | null {
  const pairs: readonly (readonly [number, number])[] = [
    [48, 49],
    [50, 51],
    [44, 45],
  ];
  for (const [i, j] of pairs) {
    if (row.length <= j) continue;
    const la = parseNum(getCol(row, i));
    const lo = parseNum(getCol(row, j));
    if (
      Number.isFinite(la) &&
      Number.isFinite(lo) &&
      la >= -90 &&
      la <= 90 &&
      lo >= -180 &&
      lo <= 180
    ) {
      return { lat: la, lng: lo };
    }
  }
  return null;
}

/** SQLDATE YYYYMMDD -> ISO date string. */
function sqlDateToIso(sqlDate: string): string | null {
  if (!/^\d{8}$/.test(sqlDate)) return null;
  const y = sqlDate.slice(0, 4);
  const m = sqlDate.slice(4, 6);
  const d = sqlDate.slice(6, 8);
  const iso = `${y}-${m}-${d}T12:00:00.000Z`;
  if (Number.isNaN(new Date(iso).getTime())) return null;
  return iso;
}

/** Build synthetic source_url for dedupe (daily export has no article URL). */
function sourceUrl(globalEventId: string, sqlDate: string): string {
  return `https://data.gdeltproject.org/events/?date=${sqlDate}&id=${encodeURIComponent(globalEventId)}`;
}

/**
 * Pass filter: strict conflict — EventRootCode in [14,15,16,17,18,19,20] or
 * GoldsteinScale <= -5 or actor1/actor2 mention Ukraine, Russia, Iran, Israel, Gaza.
 * EventRootCode map (for category): 14,15,16 → Political Tension; 17,18,19,20 → Armed Conflict.
 */
function passesFilter(
  eventRootCode: number,
  goldsteinScale: number,
  actor1: string,
  actor2: string
): boolean {
  const conflictRootCodes = [14, 15, 16, 17, 18, 19, 20];
  const rootOk = conflictRootCodes.includes(eventRootCode);
  const goldsteinOk = Number.isFinite(goldsteinScale) && goldsteinScale <= -5;
  const combined = `${(actor1 || "").toLowerCase()} ${(actor2 || "").toLowerCase()}`;
  const actorOk = CONFLICT_ACTOR_MENTIONS.some((m) => combined.includes(m));
  return rootOk || goldsteinOk || actorOk;
}

/** EventRootCode >= 14 → Armed Conflict, else Political Tension (per prompt). */
function categoryFromEventRootCode(eventRootCode: number): "Armed Conflict" | "Political Tension" {
  return eventRootCode >= 14 ? "Armed Conflict" : "Political Tension";
}

/** Impact score for sorting (lower Goldstein = more negative; more mentions = higher impact). */
function impactScore(goldsteinScale: number, numMentions: number): number {
  const m = Number.isFinite(numMentions) ? Math.min(numMentions, 100) : 0;
  return -goldsteinScale * 10 + m;
}

/** Fetch with 30s timeout. */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": "globalstability-mvp/1.0",
        ...(options.headers as Record<string, string>),
      },
    });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Resolve zip URL: try lastupdate.txt (15-min) then fallback to daily export. */
async function resolveZipUrl(options: { date?: string }): Promise<{ url: string; label: string }> {
  try {
    const res = await fetchWithTimeout(LASTUPDATE_TXT);
    if (!res.ok) throw new Error(`${res.status}`);
    const text = await res.text();
    const line = text.split(/\r?\n/)[0]?.trim() ?? "";
    const timestamp = line.replace(/\.export\.(CSV|csv)\.zip$/i, "").slice(0, 14);
    if (/^\d{14}$/.test(timestamp)) {
      const url = `${BASE_URL_V2}/${timestamp}.export.CSV.zip`;
      return { url, label: `15-min ${timestamp}` };
    }
  } catch (err) {
    log.warn("[gdelt-daily] lastupdate.txt failed, using daily export", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yyyymmdd = options.date ?? yesterday.toISOString().slice(0, 10).replace(/-/g, "");
  return {
    url: `${BASE_URL_DAILY}/${yyyymmdd}.export.CSV.zip`,
    label: `daily ${yyyymmdd}`,
  };
}

export type IngestGDELTDailyOptions = {
  /** YYYYMMDD; used only when falling back to daily export. */
  date?: string;
  /** Max items to send per run (default 200). */
  maxItems?: number;
  /** Use batch POST to /api/internal/ingest when INGEST_BASE_URL + INGEST_API_KEY set. */
  useBatchIngest?: boolean;
};

export async function ingestGDELTDaily(
  options: IngestGDELTDailyOptions = {}
): Promise<{ fetched: number; processed: number; skipped: number }> {
  const maxItems = Math.min(Math.max(options.maxItems ?? MAX_ITEMS, MIN_ITEMS), 200);
  const { url: zipUrl, label: sourceLabel } = await resolveZipUrl(options);

  let zipBuf: ArrayBuffer;
  try {
    const res = await fetchWithTimeout(zipUrl);
    if (!res.ok) {
      throw new Error(`GDELT download failed: ${res.status} ${res.statusText}`);
    }
    zipBuf = await res.arrayBuffer();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("[gdelt-daily] download failed", { url: zipUrl, error: msg });
    throw err;
  }

  let csvText: string;
  try {
    const zip = new AdmZip(Buffer.from(zipBuf));
    const entries = zip.getEntries();
    const csvEntry = entries.find(
      (e) => !e.entryName.endsWith("/") && /\.(CSV|csv)$/i.test(e.entryName)
    );
    if (!csvEntry) {
      throw new Error("No CSV file found inside zip");
    }
    csvText = csvEntry.getData().toString("utf8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("[gdelt-daily] unzip/read failed", { error: msg });
    throw err;
  }

  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  console.log(`GDELT: fetched ${lines.length} rows from ${sourceLabel}`);

  const rows: Array<{ row: string[]; eventRootCode: number; goldsteinScale: number; numMentions: number }> = [];

  for (const line of lines) {
    const row = parseRow(line);
    if (row.length < 57) continue;

    const eventRootCode = Math.floor(parseNum(getCol(row, IDX.EventRootCode)));
    const goldsteinScale = parseNum(getCol(row, IDX.GoldsteinScale));
    const numMentions = Math.floor(parseNum(getCol(row, IDX.NumMentions))) || 0;
    const actor1 = getCol(row, IDX.Actor1Name);
    const actor2 = getCol(row, IDX.Actor2Name);

    if (!passesFilter(eventRootCode, goldsteinScale, actor1, actor2)) continue;

    rows.push({ row, eventRootCode, goldsteinScale, numMentions });
  }

  rows.sort((a, b) => impactScore(b.goldsteinScale, b.numMentions) - impactScore(a.goldsteinScale, a.numMentions));
  const selected = rows.slice(0, maxItems);

  const ingestItems: IngestItem[] = [];
  const yyyymmdd = options.date ?? new Date().toISOString().slice(0, 10).replace(/-/g, "");

  let skippedMissing = 0;
  selected.forEach(({ row, eventRootCode, goldsteinScale, numMentions }) => {
    const globalEventId = getCol(row, IDX.GlobaleventID);
    const sqlDate = getCol(row, IDX.SQLDATE);
    const actor1 = getCol(row, IDX.Actor1Name);
    const actor2 = getCol(row, IDX.Actor2Name);
    const action = getCol(row, IDX.EventCode);
    const actionLat = parseNum(getCol(row, IDX.ActionGeo_Lat));
    const actionLng = parseNum(getCol(row, IDX.ActionGeo_Long));
    const actor1Lat = parseNum(getCol(row, IDX.Actor1Geo_Lat));
    const actor1Lng = parseNum(getCol(row, IDX.Actor1Geo_Long));

    let lat = NaN;
    let lng = NaN;
    if (
      Number.isFinite(actionLat) &&
      actionLat >= -90 &&
      actionLat <= 90 &&
      Number.isFinite(actionLng) &&
      actionLng >= -180 &&
      actionLng <= 180
    ) {
      lat = actionLat;
      lng = actionLng;
    } else if (
      Number.isFinite(actor1Lat) &&
      actor1Lat >= -90 &&
      actor1Lat <= 90 &&
      Number.isFinite(actor1Lng) &&
      actor1Lng >= -180 &&
      actor1Lng <= 180
    ) {
      lat = actor1Lat;
      lng = actor1Lng;
    } else {
      const a2 = pickActor2LatLon(row);
      if (a2) {
        lat = a2.lat;
        lng = a2.lng;
      }
    }

    const validLatLon =
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180;

    let location: string | undefined = validLatLon ? `${lat},${lng}` : undefined;
    let approximatedLocation = false;

    const occurredAt = sqlDateToIso(sqlDate);
    const title = [actor1, action, actor2].filter(Boolean).join(" ").trim() || "GDELT event";

    if (!location) {
      const countryCode = getCol(row, IDX.ActionGeo_CountryCode) || getCol(row, 43);
      const centroid = getCountryCentroid(countryCode);
      if (centroid) {
        location = centroidToPrimaryLocation(centroid);
        lat = centroid[0];
        lng = centroid[1];
        approximatedLocation = true;
      }
    }
    if (!location) {
      const tf = resolveTitleCentroidFallback(title);
      if (tf) {
        lat = tf.lat;
        lng = tf.lon;
        location = `${lat},${lng}`;
        approximatedLocation = true;
      }
    }

    let summary = title;
    if ((approximatedLocation || !location) && !summary.includes("Approximate location only")) {
      summary = (summary + " Approximate location only.").slice(0, 5000);
    }
    const srcUrl = sourceUrl(globalEventId || crypto.randomUUID(), sqlDate || yyyymmdd);

    if (!title.trim()) {
      skippedMissing++;
      log.warn("[gdelt-daily] skip: missing title", { actor1: actor1 || "(empty)", actor2: actor2 || "(empty)", action: action || "(empty)" });
      return;
    }
    if (!srcUrl) {
      skippedMissing++;
      log.warn("[gdelt-daily] skip: missing source_url", { globalEventId, sqlDate });
      return;
    }

    const category = categoryFromEventRootCode(eventRootCode);
    ingestItems.push({
      feed_key: FEED_KEY,
      source_name: SOURCE_NAME,
      source_url: srcUrl,
      title: title.slice(0, 500),
      summary: summary.slice(0, 5000),
      occurred_at: occurredAt ?? undefined,
      published_at: occurredAt ?? undefined,
      location,
      ...(Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng: lng }
        : {}),
      category,
      raw: {
        event_root_code: eventRootCode,
        goldstein_scale: goldsteinScale,
        num_mentions: numMentions,
        no_coords: !location,
        approximated_location: approximatedLocation,
      },
    });
  });

  if (skippedMissing > 0) {
    console.log(`GDELT: skipped ${skippedMissing} items (missing required title, source_url, or lat/lon)`);
  }
  console.log(`GDELT: normalized ${ingestItems.length} items (required title, source_url, lat, lon)`);

  if (ingestItems.length === 0) {
    return { fetched: lines.length, processed: 0, skipped: 0 };
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
      const processed = body.processed ?? 0;
      const skipped = body.skipped ?? 0;
      console.log(`GDELT: posted to ingest API, processed=${processed}, skipped=${skipped}`);
      if (!res.ok) {
        log.error("[gdelt-daily] batch ingest failed", { status: res.status });
        return { fetched: ingestItems.length, processed: 0, skipped: ingestItems.length };
      }
      return {
        fetched: ingestItems.length,
        processed,
        skipped,
      };
    } catch (err) {
      log.error("[gdelt-daily] batch ingest request failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  const { processed, skipped } = await processIngestBatch(FEED_KEY, ingestItems, log);
  console.log(`GDELT: posted (in-process), processed=${processed}, skipped=${skipped}`);
  return { fetched: ingestItems.length, processed, skipped };
}
