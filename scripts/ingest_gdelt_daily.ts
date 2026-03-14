/**
 * GDELT daily conflict-focused ingestion.
 * Downloads yesterday's export CSV zip, filters for violence/protests and negative Goldstein,
 * normalizes to draft format, and POSTs batch to /api/internal/ingest (or processes in-process).
 * Env: INGEST_BASE_URL + INGEST_API_KEY for batch POST; else uses processIngestBatch.
 * Noisy — future filtering recommended (see README).
 */

import { ingestGDELTDaily } from "@/lib/ingest/gdeltDaily";

async function main(): Promise<number> {
  try {
    const result = await ingestGDELTDaily();
    console.log(
      `GDELT daily ingest done. Fetched: ${result.fetched}, Processed: ${result.processed}, Skipped: ${result.skipped}`
    );
    return 0;
  } catch (err) {
    console.error("GDELT daily ingest failed:", err instanceof Error ? err.message : err);
    return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
