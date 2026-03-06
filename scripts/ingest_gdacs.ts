/**
 * GDACS RSS ingestion script (MVP).
 * Thin wrapper around ingestGDACS; run via cron or: npm run ingest:gdacs
 * Respects feed registry: skips if feed gdacs_rss is disabled.
 *
 * Env: GDACS_RSS_URL (from .env.local).
 */

import "dotenv/config";
import { config } from "dotenv";

config({ path: ".env.local" });

export type RunIngestResult = { fetched: number; processed: number; skipped: number };

export async function runIngest(): Promise<RunIngestResult | null> {
  const { getFeedConfig, updateFeedLastRun } = await import("@/lib/feeds/getFeedConfig");
  const feedConfig = await getFeedConfig("gdacs_rss");
  if (!feedConfig || !feedConfig.enabled) return null;
  const { ingestGDACS } = await import("@/lib/ingest/gdacs");
  const result = await ingestGDACS();
  await updateFeedLastRun("gdacs_rss");
  return { fetched: result.fetched, processed: result.processed, skipped: result.skipped };
}

async function main(): Promise<number> {
  const result = await runIngest();
  if (result == null) {
    console.log("Feed gdacs_rss is disabled in registry.");
    return 0;
  }
  console.log(
    `Fetched ${result.fetched} items. Processed: ${result.processed}, Skipped: ${result.skipped}`
  );
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
