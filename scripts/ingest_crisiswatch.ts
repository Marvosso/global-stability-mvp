/**
 * CrisisWatch ingestion script.
 * Fetches curated geopolitical/conflict RSS, maps to taxonomy (Political Tension default, Armed Conflict when clear),
 * sends through dedupe + incident pipeline.
 *
 * Env (from .env.local):
 * - CRISISWATCH_RSS_URL — optional, default https://www.crisisgroup.org/crisiswatch/rss.xml
 * - NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — required for direct DB
 */

import "dotenv/config";
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
config({ path: path.join(projectRoot, ".env.local") });

export type RunIngestResult = { fetched: number; processed: number; skipped: number };

export async function runIngest(): Promise<RunIngestResult | null> {
  const { getFeedConfig, updateFeedLastRun } = await import("@/lib/feeds/getFeedConfig");
  const feedConfig = await getFeedConfig("crisiswatch");
  if (feedConfig && !feedConfig.enabled) return null;

  const { ingestCrisisWatch } = await import("@/lib/ingest/crisiswatch");
  const result = await ingestCrisisWatch();
  if (feedConfig) await updateFeedLastRun("crisiswatch");
  return result;
}

async function main(): Promise<number> {
  try {
    const result = await runIngest();
    if (result == null) {
      console.log("Feed crisiswatch is disabled in registry.");
      return 0;
    }
    console.log(
      `CrisisWatch: fetched ${result.fetched} items. Processed: ${result.processed}, Skipped: ${result.skipped}`
    );
    return 0;
  } catch (err) {
    console.error("Failed to fetch CrisisWatch RSS:", err);
    return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
