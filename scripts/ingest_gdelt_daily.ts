/**
 * GDELT conflict-focused ingestion (15-min update feed or daily fallback).
 * Uses lastupdate.txt to get latest 15-min zip; 30s fetch timeout; max 200 rows.
 * Requires title, source_url, lat, lon per item; POSTs to /api/internal/ingest with feed_key gdelt_events.
 * Env: INGEST_BASE_URL + INGEST_API_KEY for batch POST; else uses processIngestBatch.
 */

import { ingestGDELTDaily } from "@/lib/ingest/gdeltDaily";

async function main(): Promise<number> {
  try {
    const result = await ingestGDELTDaily();
    console.log(
      `GDELT ingest done. Fetched: ${result.fetched}, Processed: ${result.processed}, Skipped: ${result.skipped}`
    );
    return 0;
  } catch (err) {
    console.error("GDELT ingest failed:", err instanceof Error ? err.message : err);
    return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
