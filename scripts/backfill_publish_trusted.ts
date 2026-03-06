/**
 * One-time backfill: auto-publish UnderReview events from trusted structured feeds
 * (USGS, GDACS, FIRMS) with High confidence.
 *
 * Usage:
 *   DRY_RUN=true npx tsx scripts/backfill_publish_trusted.ts   # count only, no changes
 *   npx tsx scripts/backfill_publish_trusted.ts                 # perform updates
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

async function getTrustedSourceIds(): Promise<string[]> {
  const { data: sources, error } = await supabase
    .from("sources")
    .select("id, domain, name");

  if (error) {
    throw new Error(`Failed to fetch sources: ${error.message}`);
  }

  const trusted = new Set<string>();
  for (const s of sources ?? []) {
    const domain = (s.domain ?? "").toLowerCase();
    const name = (s.name ?? "").toLowerCase();
    if (
      domain.includes("usgs.gov") ||
      domain.includes("gdacs.org") ||
      domain.includes("firms") ||
      name.includes("firms")
    ) {
      trusted.add(s.id);
    }
  }
  return Array.from(trusted);
}

async function getMatchingEventIds(trustedSourceIds: string[]): Promise<string[]> {
  if (trustedSourceIds.length === 0) return [];

  const { data: links, error: linkErr } = await supabase
    .from("event_sources")
    .select("event_id")
    .in("source_id", trustedSourceIds);

  if (linkErr) {
    throw new Error(`Failed to fetch event_sources: ${linkErr.message}`);
  }

  const eventIds = [...new Set((links ?? []).map((r) => r.event_id))];
  if (eventIds.length === 0) return [];

  const { data: events, error: eventErr } = await supabase
    .from("events")
    .select("id")
    .in("id", eventIds)
    .eq("status", "UnderReview")
    .eq("confidence_level", "High");

  if (eventErr) {
    throw new Error(`Failed to fetch events: ${eventErr.message}`);
  }

  return (events ?? []).map((e) => e.id);
}

async function main() {
  console.log(DRY_RUN ? "[DRY RUN] Counting matching events..." : "Finding matching events...");

  const trustedSourceIds = await getTrustedSourceIds();
  console.log(`Trusted sources (usgs.gov, gdacs.org, firms): ${trustedSourceIds.length}`);

  const eventIds = await getMatchingEventIds(trustedSourceIds);

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would publish ${eventIds.length} events`);
    return;
  }

  if (eventIds.length === 0) {
    console.log("No matching events to publish.");
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

  console.log(`Backfill complete. Published ${updated} events.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
