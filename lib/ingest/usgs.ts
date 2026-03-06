/**
 * USGS Earthquake GeoJSON ingestion: fetch feed, normalize to ingest items, write drafts directly.
 * Used by cron route and CLI script. No HTTP call to ingest API; uses supabaseAdmin and createDraftEventAndMaybeCandidate.
 */

import type { IngestItem } from "@/app/api/_lib/validation";
import { supabaseAdmin } from "@/app/api/_lib/db";
import {
  createDraftEventAndMaybeCandidate,
  CreateDraftEventError,
} from "@/app/api/_lib/createDraftEvent";
import { mapIngestItemToDraftData } from "@/app/api/_lib/processIngestBatch";

const FEED_KEY = "usgs_eq";
const SOURCE_NAME = "USGS";

/** Minimal shape for normalized USGS items (compatible with IngestItem). */
export type UsgsIngestItem = {
  feed_key: string;
  source_name: string;
  source_url: string;
  title: string;
  summary?: string;
  occurred_at?: string;
  location?: string;
  category?: string;
  subtype?: string;
};

interface UsgsFeature {
  type: "Feature";
  id?: string;
  geometry?: { type: string; coordinates?: [number, number, number] };
  properties?: {
    mag?: number | null;
    place?: string | null;
    time?: number;
    url?: string | null;
    title?: string | null;
    [key: string]: unknown;
  };
}

interface UsgsGeoJson {
  type: "FeatureCollection";
  features?: UsgsFeature[];
}

function toIngestItem(feature: UsgsFeature): UsgsIngestItem | null {
  const props = feature.properties ?? {};
  const source_url = props.url ?? null;
  if (!source_url || typeof source_url !== "string" || !source_url.startsWith("http")) {
    return null;
  }

  const mag = props.mag != null ? Number(props.mag) : NaN;
  const place = (props.place ?? "").trim() || "Unknown location";
  const summary = Number.isNaN(mag) ? place : `M ${mag} - ${place}`;
  const title = (props.title && String(props.title).trim()) || summary;
  if (!title) return null;

  let occurred_at: string | undefined;
  if (typeof props.time === "number" && props.time > 0) {
    try {
      occurred_at = new Date(props.time).toISOString();
    } catch {
      occurred_at = undefined;
    }
  }

  let location: string | undefined;
  const coords = feature.geometry?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      location = `${lat}, ${lng}`;
    }
  }

  const item: UsgsIngestItem = {
    feed_key: FEED_KEY,
    source_name: SOURCE_NAME,
    source_url,
    title: title.slice(0, 500),
    summary: summary.slice(0, 5000),
    category: "Natural Disaster",
    subtype: "Earthquake",
    ...(occurred_at && { occurred_at }),
    ...(location && { location }),
  };
  return item;
}

const log = {
  error: (msg: string, meta?: Record<string, unknown>) => console.error(msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(msg, meta),
};

export type IngestUSGSOptions = {
  feedUrl?: string;
};

export async function ingestUSGS(
  options: IngestUSGSOptions = {}
): Promise<{ fetched: number; processed: number; skipped: number }> {
  const feedUrl =
    (options.feedUrl ?? process.env.USGS_GEOJSON_URL ?? "").trim() ||
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

  if (!feedUrl.startsWith("http")) {
    throw new Error("USGS_GEOJSON_URL must be a valid HTTP(S) URL");
  }

  const res = await fetch(feedUrl, {
    headers: { "User-Agent": "global-stability-mvp/1.0" },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`USGS fetch failed: ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as UsgsGeoJson;
  const features = Array.isArray(data.features) ? data.features : [];
  const ingestItems = features
    .filter((f): f is UsgsFeature => f != null && f.type === "Feature")
    .map(toIngestItem)
    .filter((item): item is UsgsIngestItem => item != null) as IngestItem[];

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
      log.error("ingestion_items insert failed", { error: insertErr.message, source_url: item.source_url });
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
