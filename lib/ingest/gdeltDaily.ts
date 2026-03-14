/**
 * GDELT daily conflict-focused ingestion.
 * Downloads the daily export CSV zip from data.gdeltproject.org, parses it,
 * filters for EventRootCode 10–20 (violence/protests) or GoldsteinScale <= -4,
 * limits to top 50–100 by impact, normalizes to draft format, and POSTs batch to ingest.
 * Noisy; future filtering recommended (see README).
 */

import AdmZip from "adm-zip";
import type { IngestItem } from "@/app/api/_lib/validation";
import { processIngestBatch } from "@/app/api/_lib/processIngestBatch";
import { supabaseAdmin } from "@/app/api/_lib/db";

const FEED_KEY = "gdelt_events";
const SOURCE_NAME = "GDELT";
const BASE_URL = "http://data.gdeltproject.org/events";
const MAX_ITEMS = 100;
const MIN_ITEMS = 50;

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

/** Pass filter: EventRootCode in [10,20] (violence/protests) OR GoldsteinScale <= -4. */
function passesFilter(eventRootCode: number, goldsteinScale: number): boolean {
  const rootOk = eventRootCode >= 10 && eventRootCode <= 20;
  const goldsteinOk = goldsteinScale <= -4;
  return rootOk || goldsteinOk;
}

/** Impact score for sorting (lower Goldstein = more negative; more mentions = higher impact). */
function impactScore(goldsteinScale: number, numMentions: number): number {
  const m = Number.isFinite(numMentions) ? Math.min(numMentions, 100) : 0;
  return -goldsteinScale * 10 + m;
}

export type IngestGDELTDailyOptions = {
  /** YYYYMMDD; default: yesterday (current date minus 1 day). */
  date?: string;
  /** Max items to send per run (default 100). */
  maxItems?: number;
  /** Use batch POST to /api/internal/ingest when INGEST_BASE_URL + INGEST_API_KEY set. */
  useBatchIngest?: boolean;
};

export async function ingestGDELTDaily(
  options: IngestGDELTDailyOptions = {}
): Promise<{ fetched: number; processed: number; skipped: number }> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yyyymmdd = options.date ?? yesterday.toISOString().slice(0, 10).replace(/-/g, "");
  const url = `${BASE_URL}/${yyyymmdd}.export.CSV.zip`;
  const maxItems = Math.min(Math.max(options.maxItems ?? MAX_ITEMS, MIN_ITEMS), 200);

  let zipBuf: ArrayBuffer;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "globalstability-mvp/1.0" },
    });
    if (!res.ok) {
      throw new Error(`GDELT daily download failed: ${res.status} ${res.statusText}`);
    }
    zipBuf = await res.arrayBuffer();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("[gdelt-daily] download failed", { url, error: msg });
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
  const rows: Array<{ row: string[]; eventRootCode: number; goldsteinScale: number; numMentions: number }> = [];

  for (const line of lines) {
    const row = parseRow(line);
    if (row.length < 57) continue;

    const eventRootCode = Math.floor(parseNum(getCol(row, IDX.EventRootCode)));
    const goldsteinScale = parseNum(getCol(row, IDX.GoldsteinScale));
    const numMentions = Math.floor(parseNum(getCol(row, IDX.NumMentions))) || 0;

    if (!passesFilter(eventRootCode, goldsteinScale)) continue;

    rows.push({ row, eventRootCode, goldsteinScale, numMentions });
  }

  rows.sort((a, b) => impactScore(b.goldsteinScale, b.numMentions) - impactScore(a.goldsteinScale, a.numMentions));
  const selected = rows.slice(0, maxItems);

  const ingestItems: IngestItem[] = [];

  for (const { row, eventRootCode, numMentions } of selected) {
    const globalEventId = getCol(row, IDX.GlobaleventID);
    const sqlDate = getCol(row, IDX.SQLDATE);
    const actor1 = getCol(row, IDX.Actor1Name);
    const actor2 = getCol(row, IDX.Actor2Name);
    const eventCode = getCol(row, IDX.EventCode);
    const latRaw = getCol(row, IDX.ActionGeo_Lat);
    const lngRaw = getCol(row, IDX.ActionGeo_Long);

    const occurredAt = sqlDateToIso(sqlDate);
    const title = [actor1, actor2, eventCode].filter(Boolean).join(" / ") || "GDELT event";
    const summary = title;
    const lat = parseNum(latRaw);
    const lng = parseNum(lngRaw);
    const location =
      Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
        ? `${lat},${lng}`
        : undefined;

    const srcUrl = sourceUrl(globalEventId || crypto.randomUUID(), sqlDate || yyyymmdd);

    // EventRootCode 17–20 = Material/Verbal Conflict → Armed Conflict; 10–16 = cooperation → Political Tension.
    const category = eventRootCode >= 17 && eventRootCode <= 20 ? "Armed Conflict" : "Political Tension";

    ingestItems.push({
      feed_key: FEED_KEY,
      source_name: SOURCE_NAME,
      source_url: srcUrl,
      title: title.slice(0, 500),
      summary: summary.slice(0, 5000),
      occurred_at: occurredAt ?? undefined,
      published_at: occurredAt ?? undefined,
      location,
      category,
      raw: { event_root_code: eventRootCode, num_mentions: numMentions },
    });
  }

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
        log.error("[gdelt-daily] batch ingest failed", { status: res.status });
        return { fetched: ingestItems.length, processed: 0, skipped: ingestItems.length };
      }
      return {
        fetched: ingestItems.length,
        processed: body.processed ?? 0,
        skipped: body.skipped ?? 0,
      };
    } catch (err) {
      log.error("[gdelt-daily] batch ingest request failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  const { processed, skipped } = await processIngestBatch(FEED_KEY, ingestItems, log);
  return { fetched: ingestItems.length, processed, skipped };
}
