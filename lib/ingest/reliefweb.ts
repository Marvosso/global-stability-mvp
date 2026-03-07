/**
 * ReliefWeb Disasters API ingestion.
 * Fetches ongoing disasters from the ReliefWeb JSON API (not RSS).
 * Maps disaster type names to Natural Disaster subtypes where possible.
 * API: https://api.reliefweb.int/v1/disasters
 */

import type { IngestItem } from "@/app/api/_lib/validation";
import type { EventSubtype } from "./genericRss";
import { supabaseAdmin } from "@/app/api/_lib/db";
import {
  createDraftEventAndMaybeCandidate,
  CreateDraftEventError,
} from "@/app/api/_lib/createDraftEvent";
import { mapIngestItemToDraftData } from "@/app/api/_lib/processIngestBatch";

const FEED_KEY = "reliefweb_disasters";
const SOURCE_NAME = "ReliefWeb Disasters";

const DEFAULT_API_URL =
  "https://api.reliefweb.int/v1/disasters?appname=global-stability-mvp&limit=50" +
  "&fields[include][]=title&fields[include][]=date&fields[include][]=country" +
  "&fields[include][]=type&fields[include][]=url&fields[include][]=status" +
  "&filter[field]=status&filter[value]=ongoing";

/** Map ReliefWeb disaster type names to valid event_subtype values. */
function mapDisasterType(typeName: string): EventSubtype | undefined {
  const lower = typeName.toLowerCase();
  if (lower.includes("flood") || lower.includes("flash flood")) return "Flood";
  if (lower.includes("cyclone") || lower.includes("hurricane") || lower.includes("typhoon"))
    return "Cyclone";
  if (lower.includes("earthquake") || lower.includes("seismic")) return "Earthquake";
  if (lower.includes("drought")) return "Drought";
  if (lower.includes("wildfire") || lower.includes("forest fire")) return "Wildfire";
  return undefined;
}

type ReliefWebDisaster = {
  id: number;
  fields: {
    title?: string;
    url?: string;
    status?: string;
    date?: { created?: string; event?: string };
    country?: Array<{ name: string; iso3?: string }>;
    type?: Array<{ name: string }>;
  };
};

type ReliefWebResponse = {
  data?: ReliefWebDisaster[];
};

const log = {
  error: (msg: string, meta?: Record<string, unknown>) => console.error(msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(msg, meta),
};

export async function ingestReliefWeb(
  options: { apiUrl?: string } = {}
): Promise<{ fetched: number; processed: number; skipped: number }> {
  const apiUrl =
    (options.apiUrl ?? process.env.RELIEFWEB_API_URL ?? "").trim() || DEFAULT_API_URL;

  const res = await fetch(apiUrl, {
    headers: { "User-Agent": "global-stability-mvp/1.0", "Accept": "application/json" },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `ReliefWeb API fetch failed: ${res.status} ${res.statusText} ${body.slice(0, 200)}`
    );
  }

  const json = (await res.json()) as ReliefWebResponse;
  const disasters = json.data ?? [];

  const ingestItems: IngestItem[] = disasters
    .map((disaster): IngestItem | null => {
      const fields = disaster.fields;
      const title = (fields.title ?? "").trim();
      const sourceUrl = (fields.url ?? "").trim();
      if (!title || !sourceUrl) return null;

      const firstType = fields.type?.[0]?.name ?? "";
      const subtype = mapDisasterType(firstType);

      const countryName = fields.country?.[0]?.name ?? "";
      const location = countryName || undefined;

      const dateStr = fields.date?.event ?? fields.date?.created;

      return {
        feed_key: FEED_KEY,
        source_name: SOURCE_NAME,
        source_url: sourceUrl,
        title: title.slice(0, 500),
        summary: [firstType, countryName].filter(Boolean).join(" — ") || undefined,
        published_at: dateStr || undefined,
        occurred_at: dateStr || undefined,
        location,
        category: "Natural Disaster",
        subtype,
        confidence_level: "High",
      } as IngestItem;
    })
    .filter((x): x is IngestItem => x != null);

  if (ingestItems.length === 0) {
    return { fetched: 0, processed: 0, skipped: 0 };
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
      log.error("ingestion_items insert failed", {
        error: insertErr.message,
        source_url: item.source_url,
      });
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

  return { fetched: ingestItems.length, processed, skipped };
}
