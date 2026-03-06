/**
 * ReliefWeb ingestion script (MVP).
 * Fetches latest items from a ReliefWeb RSS feed, dedupes by source_url via ingestion_items,
 * and POSTs each new item to /api/internal/ingest (creates draft event + source candidate).
 * No API calls to api.reliefweb.int; RSS only. All created events stay UnderReview.
 *
 * Env: INGEST_API_KEY, INGEST_BASE_URL (e.g. http://localhost:3000), RELIEFWEB_RSS_URL,
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY).
 * Loaded from .env.local.
 */

import { createClient } from "@supabase/supabase-js";
import Parser from "rss-parser";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");
try {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
} catch (e) {
  console.error("Could not load .env.local:", (e as Error).message);
}

const INGEST_API_KEY = (process.env.INGEST_API_KEY ?? "").trim();
const INGEST_BASE_URL = (process.env.INGEST_BASE_URL ?? process.env.NEXT_PUBLIC_VERCEL_URL ?? "http://localhost:3000")
  .trim()
  .replace(/\/$/, "");
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const SERVICE_ROLE_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? ""
).trim();
const RELIEFWEB_RSS_URL = (process.env.RELIEFWEB_RSS_URL ?? "https://reliefweb.int/updates/rss.xml").trim();

if (!INGEST_API_KEY) {
  console.error("Missing INGEST_API_KEY in .env.local");
  process.exit(1);
}
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
if (!RELIEFWEB_RSS_URL || !RELIEFWEB_RSS_URL.startsWith("http")) {
  console.error("RELIEFWEB_RSS_URL must be a valid HTTP(S) URL. Set it in .env.local.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const DEFAULT_CATEGORY = "Political Tension";
const CONFIDENCE_DEFAULT = "Medium";

type RssItem = { title: string; link: string; pubDate?: string };

/** Fallback when rss-parser fails (e.g. malformed or non-standard XML). */
function parseRssItemsFromXml(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemBlock = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  const tag = (name: string) => new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i");
  let m: RegExpExecArray | null;
  while ((m = itemBlock.exec(xml)) !== null) {
    const block = m[1];
    const titleMatch = tag("title").exec(block);
    const linkMatch = tag("link").exec(block) || tag("guid").exec(block);
    const pubMatch = tag("pubDate").exec(block) || tag("date").exec(block);
    const title = (titleMatch?.[1] ?? "").replace(/<[^>]+>/g, "").replace(/^\s+|\s+$/g, "");
    const link = (linkMatch?.[1] ?? "").replace(/^\s+|\s+$/g, "");
    const pubDate = pubMatch?.[1]?.replace(/^\s+|\s+$/g, "");
    if (link && link.startsWith("http")) {
      items.push({ title, link, pubDate });
    }
  }
  return items;
}

function buildDraftPayload(item: RssItem): {
  title: string;
  summary: string;
  category: string;
  severity: string;
  confidence_level: string;
  primary_classification: string;
  source_url: string;
  occurred_at?: string;
} {
  const title = (item.title || "Untitled").trim().slice(0, 500);
  const sourceUrl = item.link?.trim() && item.link.startsWith("http") ? item.link : "";
  const summary = title || "See link for details.";
  const occurredAt =
    item.pubDate && !Number.isNaN(Date.parse(item.pubDate))
      ? new Date(item.pubDate).toISOString()
      : undefined;

  return {
    title,
    summary: summary.slice(0, 5000),
    category: DEFAULT_CATEGORY,
    severity: "Medium",
    confidence_level: CONFIDENCE_DEFAULT,
    primary_classification: "Verified Event",
    source_url: sourceUrl,
    ...(occurredAt && { occurred_at: occurredAt }),
  };
}

async function main(): Promise<number> {
  let res: Response;
  try {
    res = await fetch(RELIEFWEB_RSS_URL, {
      headers: { "User-Agent": "global-stability-mvp/1.0" },
    });
  } catch (err) {
    console.error("RSS fetch error:", err instanceof Error ? err.message : err);
    return 1;
  }

  if (!res.ok) {
    const body = await res.text();
    console.error(`RSS fetch failed: ${res.status} ${res.statusText}`, body.slice(0, 300));
    return 1;
  }

  let xml: string;
  try {
    xml = await res.text();
  } catch (err) {
    console.error("Failed to read RSS response body:", err instanceof Error ? err.message : err);
    return 1;
  }

  let rssItems: RssItem[];
  try {
    const parser = new Parser();
    const feed = await parser.parseString(xml);
    const items = (feed.items ?? []) as Array<{ title?: string; link?: string; pubDate?: string }>;
    rssItems = items
      .map((i) => ({
        title: (i.title ?? "").trim(),
        link: (i.link ?? "").trim(),
        pubDate: i.pubDate,
      }))
      .filter((i) => i.link && i.link.startsWith("http"));
  } catch {
    rssItems = parseRssItemsFromXml(xml);
  }

  console.log(`Fetched ${rssItems.length} items from RSS`);

  let processed = 0;
  let skipped = 0;

  for (const item of rssItems) {
    const payload = buildDraftPayload(item);
    const sourceUrl = payload.source_url;
    if (!sourceUrl) {
      skipped++;
      continue;
    }

    const { data: existing } = await supabase
      .from("ingestion_items")
      .select("id, status")
      .eq("source_url", sourceUrl)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("ingestion_items")
      .insert({
        feed_key: "ReliefWeb",
        source_url: sourceUrl,
        source_name: "ReliefWeb",
        payload: { title: item.title, link: item.link, pubDate: item.pubDate },
        status: "New",
      })
      .select("id")
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") {
        skipped++;
        continue;
      }
      console.error("ingestion_items insert failed:", insertErr.message);
      continue;
    }

    const ingestRes = await fetch(`${INGEST_BASE_URL}/api/internal/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ingest-key": INGEST_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const ingestBody = await ingestRes.text();

    if (ingestRes.ok) {
      await supabase
        .from("ingestion_items")
        .update({ status: "Processed" })
        .eq("id", inserted.id);
      processed++;
      console.log(`Ingested: ${payload.title.slice(0, 50)}...`);
    } else {
      await supabase.from("ingestion_items").update({ status: "Skipped" }).eq("id", inserted.id);
      console.warn(`Skipped (${ingestRes.status}): ${payload.title.slice(0, 50)}... ${ingestBody.slice(0, 100)}`);
    }
  }

  console.log(`Done. Processed: ${processed}, Skipped (already seen or error): ${skipped}`);
  return 0;
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
