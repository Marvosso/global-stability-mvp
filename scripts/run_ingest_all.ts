/**
 * Unified ingestion runner: fetches enabled feeds from public.feeds,
 * runs the corresponding adapter for each, updates feeds.last_run (inside each adapter),
 * and logs results to ingestion_runs.
 *
 * Run: npx tsx scripts/run_ingest_all.ts
 * Env: Loaded from .env.local (dotenv). Requires Supabase and per-feed env (e.g. INGEST_API_KEY).
 */

import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
config({ path: path.join(projectRoot, ".env.local") });

const ADAPTERS: Record<string, string> = {
  usgs_eq: "./ingest_usgs",
  gdacs_rss: "./ingest_gdacs",
  firms_fire: "./ingest_firms",
  gdelt: "./ingest_gdelt",
  crisiswatch: "./ingest_crisiswatch",
};

type RunIngestResult = { fetched: number; processed: number; skipped: number };

async function main(): Promise<number> {
  const { supabaseAdmin } = await import("@/app/api/_lib/db");

  const { data: feeds, error } = await supabaseAdmin
    .from("feeds")
    .select("feed_key")
    .eq("enabled", true);

  if (error) {
    console.error("Failed to fetch enabled feeds:", error.message);
    return 1;
  }
  if (!feeds?.length) {
    console.log("No enabled feeds.");
    return 0;
  }

  console.log(`Running ingestion for ${feeds.length} feed(s): ${feeds.map((f) => f.feed_key).join(", ")}`);

  for (const { feed_key } of feeds) {
    const scriptPath = ADAPTERS[feed_key];
    const started_at = new Date().toISOString();

    if (!scriptPath) {
      console.warn(`[${feed_key}] No adapter configured; skipping.`);
      await supabaseAdmin.from("ingestion_runs").insert({
        feed_key,
        started_at,
        finished_at: new Date().toISOString(),
        status: "skipped",
        error_message: "No adapter configured",
      });
      continue;
    }

    try {
      const mod = await import(scriptPath);
      const runIngest = mod.runIngest as () => Promise<RunIngestResult | null>;
      if (typeof runIngest !== "function") {
        throw new Error("Adapter does not export runIngest");
      }

      const result = await runIngest();

      if (result == null) {
        console.log(`[${feed_key}] Disabled in registry; skipped.`);
        continue;
      }

      await supabaseAdmin.from("ingestion_runs").insert({
        feed_key,
        started_at,
        finished_at: new Date().toISOString(),
        items_fetched: result.fetched,
        processed: result.processed,
        skipped: result.skipped,
        status: "ok",
      });
      console.log(
        `[${feed_key}] fetched ${result.fetched}, processed ${result.processed}, skipped ${result.skipped}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${feed_key}] Error:`, message);
      try {
        await supabaseAdmin.from("ingestion_runs").insert({
          feed_key,
          started_at,
          finished_at: new Date().toISOString(),
          status: "error",
          error_message: message.slice(0, 1000),
        });
      } catch (insertErr) {
        console.error(`[${feed_key}] Failed to log run:`, insertErr);
      }
    }
  }

  console.log("Ingestion run complete.");
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
