/**
 * One-time backfill: set primary_location from country centroid for published events missing coords.
 * Enables map markers for events that have country_code but no lat/lon.
 *
 * Usage:
 *   DRY_RUN=true npx tsx scripts/backfill_event_locations.ts   # count only, no changes
 *   npx tsx scripts/backfill_event_locations.ts                 # perform updates
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (from .env.local)
 */

import "dotenv/config";
import { config } from "dotenv";

config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { getCountryCentroid, centroidToPrimaryLocation, inferCountryFromTitle } from "../lib/countryCentroids";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.env.DRY_RUN === "true" || process.env.DRY_RUN === "1";

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

type EventRow = { id: string; country_code: string | null; title: string | null; primary_location?: string | null };

async function main() {
  console.log(
    DRY_RUN
      ? "[DRY RUN] Finding published events missing primary_location..."
      : "Finding published events missing primary_location..."
  );

  const { data: rows, error: fetchErr } = await supabase
    .from("events")
    .select("id, country_code, title, primary_location")
    .eq("status", "Published");

  if (fetchErr) {
    throw new Error(`Failed to fetch events: ${fetchErr.message}`);
  }

  const missing = (rows ?? []).filter(
    (r: EventRow) => !(r.primary_location ?? "").trim()
  ) as EventRow[];

  console.log(`Found ${missing.length} published event(s) with no primary_location.`);

  let updated = 0;
  for (const row of missing) {
    const code = row.country_code?.trim() || inferCountryFromTitle(row.title);
    const centroid = getCountryCentroid(code);
    if (!centroid) continue;
    const location = centroidToPrimaryLocation(centroid);
    if (DRY_RUN) {
      console.log(`[DRY RUN] Would set event ${row.id} (${code}) -> ${location}`);
      updated++;
      continue;
    }
    const { error: updateErr } = await supabase
      .from("events")
      .update({
        primary_location: location,
        confidence_level: "Low",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (updateErr) {
      console.warn(`Failed to update event ${row.id}:`, updateErr.message);
      continue;
    }
    updated++;
  }

  console.log(DRY_RUN ? `[DRY RUN] Would update ${updated} event(s).` : `Updated ${updated} event(s) with country centroid.`);
  console.log("Run: SELECT COUNT(*) FROM events WHERE primary_location IS NOT NULL AND status = 'Published'");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
