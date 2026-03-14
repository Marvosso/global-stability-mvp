/**
 * ReliefWeb ingestion script (v2 API).
 * Calls lib/ingest/reliefweb.ts which uses the ReliefWeb v2 disasters API.
 * Env: RELIEFWEB_APPNAME (required), optionally INGEST_BASE_URL + INGEST_API_KEY for batch POST.
 * Loads .env.local for RELIEFWEB_APPNAME and other vars.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ingestReliefWeb } from "@/lib/ingest/reliefweb";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");
try {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
} catch {
  // .env.local optional if vars set elsewhere
}

async function main(): Promise<number> {
  try {
    const result = await ingestReliefWeb();
    console.log(
      `ReliefWeb v2 ingest done. Fetched: ${result.fetched}, Processed: ${result.processed}, Skipped: ${result.skipped}`
    );
    return 0;
  } catch (err) {
    console.error("ReliefWeb ingest failed:", err instanceof Error ? err.message : err);
    return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
