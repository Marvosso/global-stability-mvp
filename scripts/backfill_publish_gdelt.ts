/**
 * One-time backfill: publish existing GDELT drafts (feed_key = gdelt_events, status UnderReview).
 * Use after enabling auto-publish for GDELT conflict events so existing drafts appear on the map.
 *
 * Usage:
 *   DRY_RUN=true npx tsx scripts/backfill_publish_gdelt.ts   # count only, no changes
 *   npx tsx scripts/backfill_publish_gdelt.ts                 # perform updates
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (from .env.local)
 */

import "dotenv/config";
import { config } from "dotenv";

config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { logBackfillAutoPublish } from "../lib/audit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.env.DRY_RUN === "true" || process.env.DRY_RUN === "1";

const BATCH_SIZE = 50;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function getGdeltUnderReviewEventIds(): Promise<string[]> {
  const { data: events, error } = await supabase
    .from("events")
    .select("id")
    .eq("feed_key", "gdelt_events")
    .eq("status", "UnderReview");

  if (error) {
    throw new Error(`Failed to fetch events: ${error.message}`);
  }

  return (events ?? []).map((e) => e.id);
}

async function main() {
  console.log(DRY_RUN ? "[DRY RUN] Counting GDELT UnderReview events..." : "Finding GDELT UnderReview events...");

  const eventIds = await getGdeltUnderReviewEventIds();

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would publish ${eventIds.length} GDELT events`);
    return;
  }

  if (eventIds.length === 0) {
    console.log("No GDELT UnderReview events to publish.");
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
      const { error: auditErr } = await logBackfillAutoPublish(supabase, { eventId });
      if (auditErr) {
        console.warn(`Audit log failed for ${eventId}:`, auditErr.message);
      }
    }

    updated += batch.length;
    console.log(`Updated batch ${batchNum}: ${batch.length} events`);
  }

  console.log(`Backfill complete. Published ${updated} GDELT events.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
