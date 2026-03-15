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
  const isGDELT = key.includes("gdelt");
  const isGdeltEvents = key === "gdelt_events";
  const isGdeltEventsLive = key === "gdelt_events_live"; // conflict-focused; auto-publish top N
  const isCrisisWatch = key.includes("crisiswatch");
  const isReliefWeb = key.includes("reliefweb");
  const isACLED = key.includes("acled");

  const rawSummary = (item.summary ?? item.title).trim().slice(0, 5000) || item.title;

  const rawDate = item.occurred_at ?? item.published_at;
  const occurredAt =
    rawDate && !Number.isNaN(new Date(rawDate).getTime())
      ? new Date(rawDate).toISOString()
      : new Date().toISOString();

  // Confidence: USGS/GDACS/FIRMS/CrisisWatch/ACLED = High; ReliefWeb/GDELT events = Medium (trusted feeds auto-publish).
  // GDELT with no location or approximated (country centroid) → Low.
  const isAcledFeed = key === "acled";
  const isTrustedFeed = isUSGS || isGDACS || isACLED;
  const rawGdelt = item.raw as { no_coords?: boolean; approximated_location?: boolean } | undefined;
  const gdeltNoLocation =
    (isGDELT || isGdeltEvents || isGdeltEventsLive) && !(item.location?.trim());
  const gdeltApproximatedLocation =
    (isGDELT || isGdeltEvents || isGdeltEventsLive) && !!rawGdelt?.approximated_location;
  const confidenceLevel =
    gdeltNoLocation || gdeltApproximatedLocation
      ? "Low"
      : isUSGS || isGDACS || isFIRMS || isCrisisWatch || isAcledFeed
        ? "High"
        : isReliefWeb || isACLED || isGdeltEventsLive || isGdeltEvents
          ? "Medium"
          : isGDELT
            ? "Medium"
            : DEFAULT_CONFIDENCE;

  // "Why" summary: trusted = title/description + official report; GDELT = Goldstein + event code; else use item summary.
  let whySummary: string;
  if (isTrustedFeed) {
    const firstLine = (item.summary || item.title).trim();
    whySummary = (firstLine ? `${firstLine} – official report` : "Official report.").slice(0, 5000);
  } else if (isGDELT || isGdeltEvents || isGdeltEventsLive) {
    const raw = item.raw as { event_root_code?: number; goldstein_scale?: number } | undefined;
    const goldstein = raw?.goldstein_scale;
    const eventCode = raw?.event_root_code;
    const gVal = typeof goldstein === "number" && Number.isFinite(goldstein) ? String(goldstein) : "n/a";
    const eVal = typeof eventCode === "number" ? String(eventCode) : "n/a";
    whySummary = `Reported by multiple news sources via GDELT. Goldstein scale: ${gVal}. Event code: ${eVal}.`;
    if (gdeltNoLocation) whySummary = (whySummary + " Approximate location only.").slice(0, 5000);
  } else {
    whySummary =
      gdeltNoLocation && !rawSummary.includes("Approximate location only")
        ? `${rawSummary.trim().slice(0, 4980)} Approximate location only.`
        : rawSummary;
  }
  const finalSummary = (whySummary || item.title || "Event reported.").trim().slice(0, 5000);

  const base: Omit<CreateDraftEventData, "subtype"> = {
    title: item.title.trim().slice(0, 500),
    summary: finalSummary,
    category: item.category ?? DEFAULT_CATEGORY,
    severity: (isUSGS ? "Low" : isGDACS ? "Medium" : DEFAULT_SEVERITY) as CreateDraftEventData["severity"],
    confidence_level: confidenceLevel as CreateDraftEventData["confidence_level"],
    primary_classification: DEFAULT_CLASSIFICATION,
    source_url: item.source_url,
    source_name: item.source_name,
    occurred_at: occurredAt,
    ...(item.feed_key && { feed_key: item.feed_key }),
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
    // GDACS: category Natural Disaster (or from item); subtype from alert type / item.
    let subtype = item.subtype;
    if (subtype === undefined) {
      const text = `${item.title} ${rawSummary}`.toLowerCase();
      if (text.includes("earthquake")) subtype = "Earthquake";
      else if (text.includes("cyclone") || text.includes("hurricane") || text.includes("typhoon"))
        subtype = "Cyclone";
      else if (text.includes("drought")) subtype = "Drought";
      else subtype = "Flood";
    }
    return {
      ...base,
      category: (item.category ?? "Natural Disaster") as CreateDraftEventData["category"],
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

  if (isACLED) {
    return {
      ...base,
      category: (item.category ?? "Armed Conflict") as CreateDraftEventData["category"],
      subtype: (item.subtype ?? "Battle") as CreateDraftEventData["subtype"],
    };
  }

  if (isGDELT || isGdeltEvents || isGdeltEventsLive) {
    // GDELT: category from item (EventRootCode >= 14 → Armed Conflict, else Political Tension).
    const raw = item.raw as { event_root_code?: number } | undefined;
    const eventRootCode = raw?.event_root_code;
    const category =
      item.category ??
      (typeof eventRootCode === "number" && eventRootCode >= 14
        ? ("Armed Conflict" as const)
        : ("Political Tension" as const));
    return {
      ...base,
      category: category as CreateDraftEventData["category"],
      subtype: (item.subtype ?? "Protest") as CreateDraftEventData["subtype"],
      ...(typeof eventRootCode === "number" && { event_root_code: eventRootCode }),
    };
  }

  if (isCrisisWatch) {
    return {
      ...base,
      category: (item.category ?? DEFAULT_CATEGORY) as CreateDraftEventData["category"],
      subtype: (item.subtype ?? "Protest") as CreateDraftEventData["subtype"],
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
