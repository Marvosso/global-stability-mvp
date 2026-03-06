/**
 * USGS Earthquake ingestion script (MVP).
 * Uses lib/ingest/usgs; run via cron or: npx tsx scripts/ingest_usgs.ts
 * Respects feed registry: skips if feed usgs_eq is disabled.
 *
 * Env: USGS_GEOJSON_URL (optional), from .env.local.
 */

import "dotenv/config";
import { config } from "dotenv";

config({ path: ".env.local" });

export type RunIngestResult = { fetched: number; processed: number; skipped: number };

export async function runIngest(): Promise<RunIngestResult | null> {
  const { getFeedConfig, updateFeedLastRun } = await import("@/lib/feeds/getFeedConfig");
  const config = await getFeedConfig("usgs_eq");
  if (!config || !config.enabled) return null;
  const { ingestUSGS } = await import("@/lib/ingest/usgs");
  const result = await ingestUSGS();
  await updateFeedLastRun("usgs_eq");
  return { fetched: result.fetched, processed: result.processed, skipped: result.skipped };
}

async function main(): Promise<number> {
  try {
    const result = await runIngest();
    if (result == null) {
      console.log("Feed usgs_eq is disabled in registry.");
      return 0;
    }
    console.log(`Fetched ${result.fetched} items. Processed: ${result.processed}, Skipped: ${result.skipped}`);
    return 0;
  } catch (e) {
    console.error(e);
    return 1;
  }
}

main().then((code) => {
  process.exitCode = code;
});
