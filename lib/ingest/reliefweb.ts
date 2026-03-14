/**
 * ReliefWeb Disasters v2 API ingestion.
 * Fetches disasters from https://api.reliefweb.int/v2/disasters (not RSS).
 * Uses appname from RELIEFWEB_APPNAME (e.g. approved appname from ReliefWeb).
 * Maps into Humanitarian Crisis taxonomy: Food Crisis, Population Displacement, Flood, Drought, Disease Outbreak.
 */

import type { IngestItem } from "@/app/api/_lib/validation";
import { supabaseAdmin } from "@/app/api/_lib/db";
import {
  createDraftEventAndMaybeCandidate,
  CreateDraftEventError,
} from "@/app/api/_lib/createDraftEvent";
import { mapIngestItemToDraftData } from "@/app/api/_lib/processIngestBatch";

const FEED_KEY = "reliefweb_disasters";
const SOURCE_NAME = "ReliefWeb Disasters";

const V2_BASE = "https://api.reliefweb.int/v2/disasters";
const PAGE_LIMIT = 50;

const DEFAULT_CATEGORY = "Humanitarian Crisis" as const;

/** Map ReliefWeb type names into event taxonomy. */
function mapReliefWebToTaxonomy(typeName: string): {
  category: typeof DEFAULT_CATEGORY;
  subtype: "Food Crisis" | "Population Displacement" | "Flood" | "Drought" | "Disease Outbreak" | undefined;
} {
  const lower = typeName.toLowerCase();
  if (lower.includes("famine") || lower.includes("food security")) return { category: DEFAULT_CATEGORY, subtype: "Food Crisis" };
  if (lower.includes("displacement")) return { category: DEFAULT_CATEGORY, subtype: "Population Displacement" };
  if (lower.includes("flood") || lower.includes("flash flood")) return { category: DEFAULT_CATEGORY, subtype: "Flood" };
  if (lower.includes("drought")) return { category: DEFAULT_CATEGORY, subtype: "Drought" };
  if (lower.includes("epidemic") || lower.includes("disease outbreak")) return { category: DEFAULT_CATEGORY, subtype: "Disease Outbreak" };
  return { category: DEFAULT_CATEGORY, subtype: undefined };
}

/** v2 API disaster item: data array element. */
type ReliefWebDisaster = {
  id?: number;
  fields?: {
    name?: string;
    url?: string;
    status?: string;
    date?: { created?: string; event?: string };
    country?: Array<{ name: string; iso3?: string }>;
    type?: Array<{ name: string }>;
    primary_country?: Array<{ location?: Array<{ lat?: number; lon?: number }> }>;
    [key: string]: unknown;
  };
};

/** v2 API response. */
type ReliefWebV2Response = {
  data?: ReliefWebDisaster[];
  links?: { next?: { href?: string } };
};

const log = {
  error: (msg: string, meta?: Record<string, unknown>) => console.error(msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(msg, meta),
};

/** Get last run date (YYYY-MM-DD) for this feed, or fallback to N days ago. */
async function getLastRunDateFallback(daysAgo = 7): Promise<string> {
  const { data } = await supabaseAdmin
    .from("ingestion_runs")
    .select("finished_at")
    .eq("feed_key", FEED_KEY)
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.finished_at) {
    const d = new Date(data.finished_at);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const fallback = new Date();
  fallback.setDate(fallback.getDate() - daysAgo);
  return fallback.toISOString().slice(0, 10);
}

/** Build v2 URL for a page (offset 0, 50, ...). */
function buildV2Url(appname: string, dateFrom: string, offset: number): string {
  const url = new URL(V2_BASE);
  url.searchParams.set("appname", appname);
  url.searchParams.set("limit", String(PAGE_LIMIT));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("sort[]", "date:desc");
  url.searchParams.set("filter[field]", "date.event");
  url.searchParams.set("filter[value][from]", `${dateFrom}T00:00:00+00:00`);
  return url.toString();
}

/** Fetch one page from v2 API. */
async function fetchDisastersPage(
  appname: string,
  dateFrom: string,
  offset: number
): Promise<{ data: ReliefWebDisaster[]; nextOffset: number | null }> {
  const apiUrl = buildV2Url(appname, dateFrom, offset);
  const res = await fetch(apiUrl, {
    headers: { "User-Agent": "globalstability-mvp/1.0", Accept: "application/json" },
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const body = await res.text();
    throw new Error(
      `ReliefWeb API returned non-JSON (${contentType}). Status: ${res.status}. Body: ${body.slice(0, 300)}`
    );
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `ReliefWeb API fetch failed: ${res.status} ${res.statusText} ${body.slice(0, 300)}`
    );
  }

  let json: ReliefWebV2Response;
  try {
    json = (await res.json()) as ReliefWebV2Response;
  } catch (e) {
    throw new Error(`ReliefWeb API response parse error: ${e instanceof Error ? e.message : String(e)}`);
  }

  const data = Array.isArray(json.data) ? json.data : [];
  const nextOffset = data.length >= PAGE_LIMIT ? offset + PAGE_LIMIT : null;
  return { data, nextOffset };
}

/** Normalize one v2 disaster to IngestItem. Handles both { fields: {...} } and flat shape. */
function disasterToIngestItem(disaster: ReliefWebDisaster): IngestItem | null {
  const rawFields = disaster.fields ?? (disaster as unknown as Record<string, unknown>);
  const fields = typeof rawFields === "object" && rawFields !== null ? rawFields : {};
  const title = (String(fields.name ?? "")).trim();
  const sourceUrl = (String(fields.url ?? "")).trim();
  if (!title || !sourceUrl || !sourceUrl.startsWith("http")) return null;

  const typeArr = fields.type as Array<{ name?: string }> | undefined;
  const firstType = typeArr?.[0]?.name ?? "";
  const { category, subtype } = mapReliefWebToTaxonomy(firstType);
  const countryArr = fields.country as Array<{ name?: string }> | undefined;
  const countryName = countryArr?.[0]?.name ?? "";

  let location: string | undefined;
  const primaryArr = fields.primary_country as Array<{ location?: Array<{ lat?: number; lon?: number }> }> | undefined;
  const primary = primaryArr?.[0];
  const locs = primary?.location;
  if (Array.isArray(locs) && locs[0] != null) {
    const lat = locs[0].lat;
    const lon = locs[0].lon;
    if (typeof lat === "number" && typeof lon === "number" && !Number.isNaN(lat) && !Number.isNaN(lon)) {
      location = `${lat},${lon}`;
    }
  }
  if (!location && countryName) location = countryName;

  const dateObj = fields.date as { event?: string; created?: string } | undefined;
  const dateStr = dateObj?.event ?? dateObj?.created;

  return {
    feed_key: FEED_KEY,
    source_name: SOURCE_NAME,
    source_url: sourceUrl,
    title: title.slice(0, 500),
    summary: [firstType, countryName].filter(Boolean).join(" — ") || undefined,
    published_at: dateStr ?? undefined,
    occurred_at: dateStr ?? undefined,
    location,
    category,
    subtype,
    raw: disaster,
  };
}

/** Fetch all pages and return normalized IngestItem[]. */
async function fetchAllDisasters(appname: string, dateFrom: string): Promise<IngestItem[]> {
  const items: IngestItem[] = [];
  let offset = 0;

  for (;;) {
    const { data, nextOffset } = await fetchDisastersPage(appname, dateFrom, offset);
    for (const d of data) {
      const item = disasterToIngestItem(d);
      if (item) items.push(item);
    }
    if (nextOffset == null) break;
    offset = nextOffset;
  }

  return items;
}

export async function ingestReliefWeb(
  options: { apiUrl?: string; appname?: string; useBatchIngest?: boolean } = {}
): Promise<{ fetched: number; processed: number; skipped: number }> {
  const appname = (options.appname ?? process.env.RELIEFWEB_APPNAME ?? "").trim();
  if (!appname) {
    throw new Error(
      "RELIEFWEB_APPNAME is required for ReliefWeb API. Set it in .env.local (e.g. your approved appname from ReliefWeb)."
    );
  }

  let runId: string | null = null;
  try {
    const { data: runRow, error: runInsertErr } = await supabaseAdmin
      .from("ingestion_runs")
      .insert({ feed_key: FEED_KEY, items_fetched: 0, processed: 0, skipped: 0, status: "running" })
      .select("id")
      .single();
    runId = runInsertErr ? null : runRow?.id ?? null;
  } catch {
    runId = null;
  }

  let ingestItems: IngestItem[];
  try {
    const dateFrom = await getLastRunDateFallback(7);
    ingestItems = await fetchAllDisasters(appname, dateFrom);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("[reliefweb] v2 fetch failed", { error: message });
    if (runId) {
      await supabaseAdmin
        .from("ingestion_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: "error",
          items_fetched: 0,
          processed: 0,
          skipped: 0,
        })
        .eq("id", runId);
    }
    throw err;
  }

  if (ingestItems.length === 0) {
    if (runId) {
      await supabaseAdmin
        .from("ingestion_runs")
        .update({
          finished_at: new Date().toISOString(),
          items_fetched: 0,
          processed: 0,
          skipped: 0,
          status: "ok",
        })
        .eq("id", runId);
    }
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
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        log.error("[reliefweb] batch ingest failed", { status: res.status, body });
        if (runId) {
          await supabaseAdmin
            .from("ingestion_runs")
            .update({
              finished_at: new Date().toISOString(),
              items_fetched: ingestItems.length,
              processed: 0,
              skipped: ingestItems.length,
              status: "error",
            })
            .eq("id", runId);
        }
        return { fetched: ingestItems.length, processed: 0, skipped: ingestItems.length };
      }
      const processed = Number((body as { processed?: number }).processed ?? 0);
      const skipped = Number((body as { skipped?: number }).skipped ?? 0);
      if (runId) {
        await supabaseAdmin
          .from("ingestion_runs")
          .update({
            finished_at: new Date().toISOString(),
            items_fetched: ingestItems.length,
            processed,
            skipped,
            status: "ok",
          })
          .eq("id", runId);
      }
      return { fetched: ingestItems.length, processed, skipped };
    } catch (err) {
      log.error("[reliefweb] batch ingest request failed", { error: err instanceof Error ? err.message : String(err) });
      if (runId) {
        await supabaseAdmin
          .from("ingestion_runs")
          .update({
            finished_at: new Date().toISOString(),
            items_fetched: ingestItems.length,
            processed: 0,
            skipped: ingestItems.length,
            status: "error",
          })
          .eq("id", runId);
      }
      throw err;
    }
  }

  let processed = 0;
  let skipped = 0;

  for (const item of ingestItems) {
    const { data: existing } = await supabaseAdmin
      .from("ingestion_items")
      .select("id")
      .eq("source_url", item.source_url)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("ingestion_items")
      .insert({
        feed_key: FEED_KEY,
        source_url: item.source_url,
        source_name: SOURCE_NAME,
        payload: item as unknown as Record<string, unknown>,
        status: "New",
      })
      .select("id")
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") {
        skipped++;
        continue;
      }
      log.error("ingestion_items insert failed", { error: insertErr.message, source_url: item.source_url });
      skipped++;
      continue;
    }

    const draftData = mapIngestItemToDraftData(item);
    try {
      await createDraftEventAndMaybeCandidate({ data: draftData, createdBy: null });
      await supabaseAdmin
        .from("ingestion_items")
        .update({ status: "Processed" })
        .eq("id", inserted.id);
      processed++;
    } catch (err) {
      if (err instanceof CreateDraftEventError) {
        log.error("Draft create failed (CreateDraftEventError)", {
          message: err.message,
          status: err.status,
          source_url: item.source_url,
        });
      } else {
        log.warn("Draft create failed", {
          source_url: item.source_url,
          message: err instanceof Error ? err.message : "Unknown",
        });
      }
      await supabaseAdmin
        .from("ingestion_items")
        .update({ status: "Skipped" })
        .eq("id", inserted.id);
      skipped++;
    }
  }

  if (runId) {
    try {
      await supabaseAdmin
        .from("ingestion_runs")
        .update({
          finished_at: new Date().toISOString(),
          items_fetched: ingestItems.length,
          processed,
          skipped,
          status: "ok",
        })
        .eq("id", runId);
    } catch {
      // ignore
    }
  }

  return { fetched: ingestItems.length, processed, skipped };
}
