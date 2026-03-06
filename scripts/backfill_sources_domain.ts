/**
 * Backfill sources.domain from sources.url using eTLD+1.
 * Run after migration 20250229100000_sources_domain.sql.
 *
 * Usage: npx tsx scripts/backfill_sources_domain.ts
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (from .env.local)
 */

import "dotenv/config";
import { config } from "dotenv";

config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { normalizeDomainFromUrl } from "../lib/domain";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: rows, error } = await supabase
    .from("sources")
    .select("id, url")
    .not("url", "is", null);

  if (error) {
    console.error("Failed to fetch sources:", error.message);
    process.exit(1);
  }

  const byDomain = new Map<string, { id: string; url: string }>();
  for (const row of rows ?? []) {
    const domain = normalizeDomainFromUrl(row.url ?? "");
    if (!domain) continue;
    const existing = byDomain.get(domain);
    if (!existing) {
      byDomain.set(domain, { id: row.id, url: row.url ?? "" });
    } else {
      console.warn(`Duplicate domain ${domain}: keeping ${existing.id}, skipping ${row.id}`);
    }
  }

  let updated = 0;
  for (const [domain, { id }] of byDomain) {
    const { error: updError } = await supabase
      .from("sources")
      .update({ domain })
      .eq("id", id);

    if (updError) {
      console.error(`Failed to update source ${id}:`, updError.message);
      continue;
    }
    updated++;
  }

  console.log(`Backfilled domain for ${updated} sources`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
