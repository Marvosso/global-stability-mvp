/**
 * Bulk publish political/conflict events from GDELT and CrisisWatch.
 * Only publishes events that meet all safety criteria.
 *
 * Usage:
 *   DRY_RUN=true npx tsx scripts/backfill_publish_conflict_candidates.ts   # count only, no changes
 *   npx tsx scripts/backfill_publish_conflict_candidates.ts                 # perform updates
 *
 * Optional: REQUIRE_CORROBORATION_FOR_ARMED_CONFLICT=true
 *   When set, Armed Conflict events require incident to have at least 2 events (corroboration).
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (from .env.local)
 */

import "dotenv/config";
import { config } from "dotenv";

config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { logBackfillPublishConflict } from "../lib/audit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN =
  process.env.DRY_RUN === "true" || process.env.DRY_RUN === "1";
const REQUIRE_CORROBORATION =
  process.env.REQUIRE_CORROBORATION_FOR_ARMED_CONFLICT === "true" ||
  process.env.REQUIRE_CORROBORATION_FOR_ARMED_CONFLICT === "1";

const BATCH_SIZE = 50;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Find event IDs that qualify for bulk publish:
 * - status = UnderReview
 * - category in (Political Tension, Armed Conflict)
 * - from GDELT or CrisisWatch (via ingestion_items feed_key)
 * - confidence_level in (Medium, High)
 * - primary_location is not null
 * - incident_id is not null
 * - Optional: Armed Conflict requires incident with >= 2 events
 */
async function getQualifyingEventIds(): Promise<string[]> {
  const { data: ingestionUrls, error: ingErr } = await supabase
    .from("ingestion_items")
    .select("source_url")
    .in("feed_key", ["gdelt", "crisiswatch"])
    .eq("status", "Processed");

  if (ingErr) {
    throw new Error(`Failed to fetch ingestion_items: ${ingErr.message}`);
  }

  const urls = [...new Set((ingestionUrls ?? []).map((r) => r.source_url).filter(Boolean))];
  if (urls.length === 0) return [];

  const { data: links, error: linkErr } = await supabase
    .from("event_sources")
    .select("event_id")
    .in("claim_url", urls);

  if (linkErr) {
    throw new Error(`Failed to fetch event_sources: ${linkErr.message}`);
  }

  const eventIds = [...new Set((links ?? []).map((r) => r.event_id))];
  if (eventIds.length === 0) return [];

  const { data: events, error: eventErr } = await supabase
    .from("events")
    .select("id, category, incident_id")
    .in("id", eventIds)
    .eq("status", "UnderReview")
    .in("category", ["Political Tension", "Armed Conflict"])
    .in("confidence_level", ["Medium", "High"])
    .not("primary_location", "is", null)
    .not("incident_id", "is", null);

  if (eventErr) {
    throw new Error(`Failed to fetch events: ${eventErr.message}`);
  }

  let candidates = events ?? [];

  if (REQUIRE_CORROBORATION) {
    const armedIds = candidates
      .filter((e) => e.category === "Armed Conflict" && e.incident_id)
      .map((e) => e.id);
    const incidentIds = [...new Set(candidates.map((e) => e.incident_id).filter(Boolean))] as string[];

    if (incidentIds.length === 0) return candidates.map((e) => e.id);

    const { data: counts } = await supabase
      .from("events")
      .select("incident_id")
      .in("incident_id", incidentIds);
    const countByIncident = new Map<string, number>();
    for (const r of counts ?? []) {
      if (r.incident_id) {
        countByIncident.set(
          r.incident_id,
          (countByIncident.get(r.incident_id) ?? 0) + 1
        );
      }
    }

    candidates = candidates.filter((e) => {
      if (e.category !== "Armed Conflict" || !e.incident_id) return true;
      return (countByIncident.get(e.incident_id) ?? 0) >= 2;
    });
  }

  return candidates.map((e) => e.id);
}

async function main() {
  console.log(
    DRY_RUN ? "[DRY RUN] Counting qualifying events..." : "Finding qualifying events..."
  );
  if (REQUIRE_CORROBORATION) {
    console.log("Armed Conflict: requiring >= 2 events per incident (corroboration)");
  }

  const eventIds = await getQualifyingEventIds();

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would publish ${eventIds.length} events`);
    return;
  }

  if (eventIds.length === 0) {
    console.log("No qualifying events to publish.");
    return;
  }

  let updated = 0;
  for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
    const batch = eventIds.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    const { error: updateErr } = await supabase
      .from("events")
      .update({ status: "Published" })
      .in("id", batch);

    if (updateErr) {
      console.error(`Failed to update batch ${batchNum}:`, updateErr.message);
      continue;
    }

    for (const eventId of batch) {
      const { error: auditErr } = await logBackfillPublishConflict(supabase, {
        eventId,
      });
      if (auditErr) {
        console.warn(`Audit log failed for ${eventId}:`, auditErr.message);
      }
    }

    updated += batch.length;
    console.log(`Updated batch ${batchNum}: ${batch.length} events`);
  }

  console.log(`Backfill complete. Published ${updated} events.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
