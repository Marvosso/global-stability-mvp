import type { CreateDraftEventData, IngestItem } from "./validation";
import {
  createDraftEventAndMaybeCandidate,
  CreateDraftEventError,
} from "./createDraftEvent";
import { supabaseAdmin } from "./db";

const DEFAULT_CATEGORY = "Political Tension" as const;
const DEFAULT_SEVERITY = "Medium" as const;
const DEFAULT_CONFIDENCE = "Medium" as const;
const DEFAULT_CLASSIFICATION = "Verified Event" as const;

export function mapIngestItemToDraftData(item: IngestItem): CreateDraftEventData {
  const key = (item.feed_key ?? item.source_name ?? "").toLowerCase();
  const isUSGS = key.includes("usgs");
  const isGDACS = key.includes("gdacs");
  const isFIRMS = key.includes("firms");

  const summary = (item.summary ?? item.title).trim().slice(0, 5000) || item.title;

  const rawDate = item.occurred_at ?? item.published_at;
  const occurredAt =
    rawDate && !Number.isNaN(new Date(rawDate).getTime())
      ? new Date(rawDate).toISOString()
      : new Date().toISOString();

  const base: Omit<CreateDraftEventData, "subtype"> = {
    title: item.title.trim().slice(0, 500),
    summary,
    category: item.category ?? DEFAULT_CATEGORY,
    severity: (isUSGS ? "Low" : isGDACS ? "Medium" : DEFAULT_SEVERITY) as CreateDraftEventData["severity"],
    confidence_level: (isUSGS || isGDACS || isFIRMS ? "High" : DEFAULT_CONFIDENCE) as CreateDraftEventData["confidence_level"],
    primary_classification: DEFAULT_CLASSIFICATION,
    source_url: item.source_url,
    source_name: item.source_name,
    occurred_at: occurredAt,
    ...(item.location?.trim() && { primary_location: item.location.trim().slice(0, 500) }),
  };

  if (isUSGS) {
    return {
      ...base,
      category: item.category ?? "Natural Disaster",
      subtype: item.subtype ?? "Earthquake",
    };
  }

  if (isGDACS) {
    let subtype = item.subtype;
    if (subtype === undefined) {
      const text = `${item.title} ${summary}`.toLowerCase();
      if (text.includes("earthquake")) subtype = "Earthquake";
      else if (text.includes("cyclone") || text.includes("hurricane") || text.includes("typhoon"))
        subtype = "Cyclone";
      else if (text.includes("drought")) subtype = "Drought";
      else subtype = "Flood";
    }
    return {
      ...base,
      category: item.category ?? "Natural Disaster",
      subtype,
    };
  }

  if (isFIRMS) {
    return {
      ...base,
      category: item.category ?? "Natural Disaster",
      subtype: item.subtype ?? "Wildfire",
    };
  }

  return {
    ...base,
    subtype: item.subtype ?? undefined,
  };
}

export type IngestBatchLog = {
  error: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
};

export async function processIngestBatch(
  feedKey: string,
  items: IngestItem[],
  log?: IngestBatchLog
): Promise<{ processed: number; skipped: number }> {
  let processed = 0;
  let skipped = 0;

  let runId: string | null = null;
  try {
    const { data: runRow, error: runInsertErr } = await supabaseAdmin
      .from("ingestion_runs")
      .insert({
        feed_key: feedKey,
        items_fetched: items.length,
        processed: 0,
        skipped: 0,
        status: "running",
      })
      .select("id")
      .single();
    runId = runInsertErr ? null : runRow?.id ?? null;
  } catch {
    runId = null;
  }

  for (const item of items) {
    const title = (item.title ?? "").trim();
    const sourceUrl = (item.source_url ?? "").trim();
    if (!title || !sourceUrl) {
      const skipReason = !title ? "empty title" : "empty source_url";
      const placeholderUrl = sourceUrl || `skip:empty:${crypto.randomUUID()}`;
      try {
        await supabaseAdmin.from("ingestion_items").insert({
          feed_key: item.feed_key ?? item.source_name,
          source_url: placeholderUrl,
          source_name: item.source_name,
          payload: { ...item, _skip_reason: skipReason } as unknown as Record<string, unknown>,
          status: "Skipped",
        });
      } catch {
        // ignore
      }
      skipped++;
      continue;
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("ingestion_items")
      .insert({
        feed_key: item.feed_key ?? item.source_name,
        source_url: item.source_url,
        source_name: item.source_name,
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
      log?.error("ingestion_items insert failed", { error: insertErr.message });
      skipped++;
      continue;
    }

    const draftData = mapIngestItemToDraftData(item);
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
        log?.error("Draft create failed (CreateDraftEventError)", {
          message: err.message,
          status: err.status,
          source_url: item.source_url,
        });
      } else {
        log?.warn("Draft create failed for item", {
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
          processed,
          skipped,
          status: "ok",
        })
        .eq("id", runId);
    } catch {
      // ignore
    }
  }

  return { processed, skipped };
}
