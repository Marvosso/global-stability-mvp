/**
 * GDELT ingestion script.
 * Fetches political tension / conflict signals from GDELT Events API,
 * maps to taxonomy (Political Tension/Protest, Armed Conflict), sends through dedupe + incident pipeline.
 *
 * Env (from .env.local):
 * - GDELT_EVENTS_URL — optional, default https://api.gdeltproject.org/api/v2/doc/doc
 * - GDELT_QUERY — optional, default (protest OR conflict OR violence OR strike OR clash OR attack OR unrest)
 * - GDELT_MAX_RECORDS — optional, default 50
 * - GDELT_TIMESPAN — optional, default 1week
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
  const feedConfig = await getFeedConfig("gdelt");
  if (feedConfig && !feedConfig.enabled) return null;

  const { ingestGDELT } = await import("@/lib/ingest/gdelt");
  const result = await ingestGDELT();
  if (feedConfig) await updateFeedLastRun("gdelt");
  return result;
}

async function main(): Promise<number> {
  try {
    const result = await runIngest();
    if (result == null) {
      console.log("Feed gdelt is disabled in registry.");
      return 0;
    }
    console.log(
      `GDELT: fetched ${result.fetched} items. Processed: ${result.processed}, Skipped: ${result.skipped}`
    );
    return 0;
  } catch (err) {
    console.error("Failed to fetch GDELT data:", err);
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
