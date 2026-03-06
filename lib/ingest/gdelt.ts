/**
 * GDELT ingestion: fetch from GDELT Events API, normalize to ingest items, write drafts directly.
 * Maps political tension / conflict signals into taxonomy.
 * Uses same dedupe + incident pipeline as USGS/GDACS.
 */

import type { IngestItem } from "@/app/api/_lib/validation";
import { supabaseAdmin } from "@/app/api/_lib/db";
import {
  createDraftEventAndMaybeCandidate,
  CreateDraftEventError,
} from "@/app/api/_lib/createDraftEvent";
import { mapIngestItemToDraftData } from "@/app/api/_lib/processIngestBatch";

const FEED_KEY = "gdelt";
const SOURCE_NAME = "GDELT";
const DEFAULT_CONFIDENCE = "Medium" as const;

/** Minimal shape for normalized GDELT items (compatible with IngestItem). */
export type GdeltIngestItem = {
  feed_key: string;
  source_name: string;
  source_url: string;
  title: string;
  summary?: string;
  published_at?: string;
  occurred_at?: string;
  location?: string;
  category?: string;
  subtype?: string;
  confidence_level?: string;
};

/**
 * Map GDELT content into existing taxonomy.
 * - protests / unrest -> Political Tension, Protest
 * - conflict / strike / clash / attack -> Armed Conflict with best subtype
 */
function mapToTaxonomy(text: string): { category: string; subtype?: string } {
  const lower = text.toLowerCase();
  if (
    /\b(protest|protests|unrest|demonstration|demonstrations|rally|rallies|march|marches)\b/.test(
      lower
    )
  ) {
    return { category: "Political Tension", subtype: "Protest" };
  }
  if (/\b(air strike|airstrike|airstrikes|bombing|bombed)\b/.test(lower)) {
    return { category: "Armed Conflict", subtype: "Air Strike" };
  }
  if (
    /\b(assassination|assassinated|targeted kill|targeted killing)\b/.test(lower)
  ) {
    return { category: "Armed Conflict", subtype: "Targeted Assassination" };
  }
  if (/\b(border skirmish|border clash|border conflict)\b/.test(lower)) {
    return { category: "Armed Conflict", subtype: "Border Skirmish" };
  }
  if (
    /\b(conflict|clash|clashes|strike|attack|attacks|battle|battles|violence|armed)\b/.test(
      lower
    )
  ) {
    return { category: "Armed Conflict", subtype: "Battle" };
  }
  return { category: "Political Tension", subtype: "Protest" };
}

function isValidUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

function toIngestItem(raw: Record<string, unknown>, feedKey: string): GdeltIngestItem | null {
  const articleUrl = (
    raw.article_url ?? raw.url ?? raw.source_url ?? ""
  ).toString().trim();
  if (!articleUrl || !isValidUrl(articleUrl)) return null;

  const title =
    (raw.title ?? "").toString().trim() ||
    articleUrl.slice(0, 500) ||
    "GDELT event";
  const summary = (raw.snippet ?? raw.description ?? raw.title ?? title)
    .toString()
    .trim()
    .slice(0, 5000);
  const seendate = (
    raw.seendate ??
    raw.date ??
    raw.dateadded ??
    raw.date_added ??
    ""
  )
    .toString()
    .trim();

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
    Number.isFinite(lat) && Number.isFinite(lng)
      ? `${lat},${lng}`.slice(0, 500)
      : undefined;

  const combinedText = `${title} ${summary}`;
  const { category, subtype } = mapToTaxonomy(combinedText);

  return {
    feed_key: feedKey,
    source_name: SOURCE_NAME,
    source_url: articleUrl,
    title: title.slice(0, 500),
    summary: summary || title.slice(0, 5000),
    ...(seendate && { published_at: seendate, occurred_at: seendate }),
    ...(location && { location }),
    category,
    subtype,
    confidence_level: DEFAULT_CONFIDENCE,
  };
}

const log = {
  error: (msg: string, meta?: Record<string, unknown>) => console.error(msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(msg, meta),
};

export type IngestGDELTOptions = {
  eventsUrl?: string;
  query?: string;
  maxRecords?: number;
  timespan?: string;
};

export async function ingestGDELT(
  options: IngestGDELTOptions = {}
): Promise<{ fetched: number; processed: number; skipped: number }> {
  const eventsUrl =
    (options.eventsUrl ?? process.env.GDELT_EVENTS_URL ?? "").trim() ||
    "https://api.gdeltproject.org/api/v2/doc/doc";
  const query =
    (options.query ?? process.env.GDELT_QUERY ?? "").trim() ||
    "(protest OR conflict OR violence OR strike OR clash OR attack OR unrest)";
  const maxRecords =
    options.maxRecords ?? (Number(process.env.GDELT_MAX_RECORDS) || 50);
  const timespan = options.timespan ?? process.env.GDELT_TIMESPAN ?? "1week";

  if (!eventsUrl.startsWith("http")) {
    throw new Error("GDELT_EVENTS_URL must be a valid HTTP(S) URL");
  }

  const url = new URL(eventsUrl);
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("mode", "artlist");
  url.searchParams.set("maxrecords", String(maxRecords));
  url.searchParams.set("timespan", timespan);

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "global-stability-mvp/1.0" },
  });
  const resText = await res.text();

  if (!res.ok) {
    throw new Error(
      `GDELT fetch failed: ${res.status} ${res.statusText} ${resText.slice(0, 200)}`
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(resText);
  } catch {
    throw new Error("GDELT response was not valid JSON.");
  }

  let rawEvents: Record<string, unknown>[] = [];
  if (Array.isArray(json)) {
    rawEvents = json as Record<string, unknown>[];
  } else if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj.data)) rawEvents = obj.data as Record<string, unknown>[];
    else if (Array.isArray(obj.articles)) rawEvents = obj.articles as Record<string, unknown>[];
    else if (Array.isArray(obj.events)) rawEvents = obj.events as Record<string, unknown>[];
  }

  const ingestItems = rawEvents
    .map((raw) => toIngestItem(raw, FEED_KEY))
    .filter((x): x is GdeltIngestItem => x != null) as IngestItem[];

  if (ingestItems.length === 0) {
    return { fetched: 0, processed: 0, skipped: 0 };
  }

  let processed = 0;
  let skipped = 0;

  for (const item of ingestItems) {
    const title = (item.title ?? "").trim();
    const sourceUrl = (item.source_url ?? "").trim();
    if (!title || !sourceUrl) {
      skipped++;
      continue;
    }

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
      log.error("ingestion_items insert failed", {
        error: insertErr.message,
        source_url: item.source_url,
      });
      skipped++;
      continue;
    }

    const draftData = mapIngestItemToDraftData(item as IngestItem);
    try {
      await createDraftEventAndMaybeCandidate({
        data: draftData,
        createdBy: null,
      });
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
        log.warn("Draft create failed for item", {
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

  return {
    fetched: ingestItems.length,
    processed,
    skipped,
  };
}
