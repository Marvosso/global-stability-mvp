/**
 * NASA FIRMS wildfire ingestion script.
 * Fetches FIRMS area CSV (world, last 1 day), parses rows, normalizes to ingest format,
 * POSTs to /api/internal/ingest.
 *
 * Env:
 * - FIRMS_MAP_KEY (or FIRMS_API_KEY) — required; get at https://firms.modaps.eosdis.nasa.gov/api/map_key
 * - FIRMS_SOURCE — optional; e.g. MODIS_NRT, VIIRS_SNPP_NRT (default: MODIS_NRT)
 * - INGEST_API_KEY — required for POST to ingest API
 * - INGEST_BASE_URL or APP_BASE_URL — optional, default http://localhost:3000
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env.local");

function loadEnvLocal(filePath: string): void {
  try {
    if (!fs.existsSync(filePath)) {
      console.error("[FIRMS] .env.local not found at:", filePath);
      return;
    }
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    let count = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
        value = value.slice(1, -1);
      process.env[key] = value;
      count++;
    }
  } catch (e) {
    // .env.local missing or unreadable
  }
}
loadEnvLocal(envPath);

const SOURCE_NAME = "NASA FIRMS";
const SOURCE_URL = "https://firms.modaps.eosdis.nasa.gov";
const DEFAULT_SOURCE = "MODIS_NRT";

type IngestItem = {
  feed_key: string;
  source_name: string;
  source_url: string;
  title: string;
  summary?: string;
  occurred_at?: string;
  location?: string;
  category: string;
  subtype: string;
};

/** Parse CSV text into rows of record objects using header row. */
function parseCsv(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((c) => c.trim().toLowerCase());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = values[j]?.trim() ?? "";
    }
    rows.push(row);
  }
  return rows;
}

/** Split a CSV line respecting quoted fields. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if ((ch === "," && !inQuotes) || (ch === "\n" && !inQuotes)) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function getStr(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k]?.trim();
    if (v) return v;
  }
  return "";
}

function normalizeRow(row: Record<string, string>, feedKey: string): IngestItem | null {
  const latStr = getStr(row, "latitude", "lat");
  const lonStr = getStr(row, "longitude", "lon", "lng");
  const lat = parseFloat(latStr);
  const lng = parseFloat(lonStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const acqDate = getStr(row, "acq_date", "acquisition_date");
  const acqTime = getStr(row, "acq_time", "acquisition_time");
  const occurredAt =
    acqDate && acqTime
      ? `${acqDate}T${acqTime.replace(/(\d{2})(\d{2})(\d{2})/, "$1:$2:$3")}Z`
      : acqDate
        ? `${acqDate}T00:00:00Z`
        : new Date().toISOString();

  return {
    feed_key: feedKey,
    source_name: SOURCE_NAME,
    source_url: SOURCE_URL,
    title: "Wildfire detected",
    summary: "Satellite wildfire detection",
    occurred_at: occurredAt,
    location: `${lat},${lng}`,
    category: "Natural Disaster",
    subtype: "Wildfire",
  };
}

async function fetchFirmsCsv(): Promise<string> {
  const mapKey = (
    process.env.FIRMS_MAP_KEY ??
    process.env.FIRMS_API_KEY ??
    ""
  ).trim();
  const source = (process.env.FIRMS_SOURCE ?? DEFAULT_SOURCE).trim();
  if (!mapKey) {
    throw new Error(
      "FIRMS_MAP_KEY (or FIRMS_API_KEY) is required. Add it to .env.local (get a free key at https://firms.modaps.eosdis.nasa.gov/api/map_key). See .env.example."
    );
  }

  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/${source}/world/1`;
  const res = await fetch(url);
  const text = await res.text();

  if (!res.ok) {
    console.error(`[FIRMS] Fetch failed: ${res.status} ${res.statusText}`);
    console.error(`[FIRMS] Response: ${text.slice(0, 500)}`);
    throw new Error(`FIRMS fetch failed: ${res.status} ${res.statusText}`);
  }

  if (text.toLowerCase().includes("invalid") && text.length < 200) {
    console.error("[FIRMS] API returned error:", text);
    throw new Error(`FIRMS API error: ${text}`);
  }

  return text;
}

export type RunIngestResult = { fetched: number; processed: number; skipped: number };

export async function runIngest(): Promise<RunIngestResult | null> {
  const { getFeedConfig, updateFeedLastRun } = await import("@/lib/feeds/getFeedConfig");
  const feedConfig = await getFeedConfig("firms_fire");
  if (!feedConfig || !feedConfig.enabled) return null;
  const feedKey = feedConfig.feed_key;

  const ingestKey = (process.env.INGEST_API_KEY ?? "").trim();
  if (!ingestKey) throw new Error("INGEST_API_KEY is required to POST to the ingest API. Set it in .env.local.");

  const ingestBaseUrl =
    (process.env.INGEST_BASE_URL ?? process.env.APP_BASE_URL ?? "http://localhost:3000")
      .trim()
      .replace(/\/$/, "") || "http://localhost:3000";

  const csvText = await fetchFirmsCsv();
  const rows = parseCsv(csvText);
  const items = rows.map((row) => normalizeRow(row, feedKey)).filter((x): x is IngestItem => x !== null);

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
  await updateFeedLastRun("firms_fire");
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
      console.log("Feed firms_fire is disabled in registry.");
      return 0;
    }
    console.log(
      `FIRMS: fetched ${result.fetched} items. Processed: ${result.processed}, Skipped: ${result.skipped}`
    );
    return 0;
  } catch (err) {
    console.error("Failed to fetch FIRMS data:", err);
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
