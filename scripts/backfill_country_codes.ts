/**
 * Backfill country_code and admin1 for events that have primary_location (lat,lng)
 * but no country_code. Uses Mapbox reverse geocoding.
 *
 * Run: npm run backfill:country-codes
 * Env: .env.local — MAPBOX_ACCESS_TOKEN or NEXT_PUBLIC_MAPBOX_TOKEN, Supabase vars for db.
 */

import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import { parsePrimaryLocation } from "@/lib/eventCoordinates";
import { reverseGeocode } from "@/lib/geocode/reverseGeocode";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
config({ path: path.join(projectRoot, ".env.local") });

const THROTTLE_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<number> {
  const { supabaseAdmin } = await import("@/app/api/_lib/db");

  const token =
    process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token?.trim()) {
    console.error("Set MAPBOX_ACCESS_TOKEN or NEXT_PUBLIC_MAPBOX_TOKEN in .env.local");
    return 1;
  }

  const { data: rows, error } = await supabaseAdmin
    .from("events")
    .select("id, primary_location")
    .not("primary_location", "is", null)
    .is("country_code", null);

  if (error) {
    console.error("Failed to fetch events:", error.message);
    return 1;
  }
  if (!rows?.length) {
    console.log("No events to backfill (all with primary_location have country_code).");
    return 0;
  }

  console.log(`Backfilling country_code/admin1 for ${rows.length} event(s).`);

  const cache = new Map<string, { country_code: string | null; admin1: string | null }>();
  let updated = 0;
  let errors = 0;

  for (const row of rows as { id: string; primary_location: string | null }[]) {
    const coords = parsePrimaryLocation(row.primary_location);
    if (!coords) continue;

    const cacheKey = `${Math.round(coords.lat * 100) / 100},${Math.round(coords.lng * 100) / 100}`;
    let geo = cache.get(cacheKey);
    if (!geo) {
      try {
        geo = await reverseGeocode(coords.lng, coords.lat);
        cache.set(cacheKey, geo);
        await sleep(THROTTLE_MS);
      } catch (e) {
        console.warn(`Geocode failed for event ${row.id}:`, e);
        errors++;
        continue;
      }
    }

    if (!geo.country_code && !geo.admin1) continue;

    const { error: updateErr } = await supabaseAdmin
      .from("events")
      .update({
        country_code: geo.country_code ?? null,
        admin1: geo.admin1 ?? null,
      })
      .eq("id", row.id);

    if (updateErr) {
      console.warn(`Update failed for event ${row.id}:`, updateErr.message);
      errors++;
    } else {
      updated++;
      if (updated % 10 === 0) console.log(`Updated ${updated}...`);
    }
  }

  console.log(`Done. Updated ${updated} event(s), ${errors} error(s).`);
  return errors > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
