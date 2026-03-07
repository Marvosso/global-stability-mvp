/**
 * CrisisWatch RSS ingestion: fetch feed, normalize to ingest items, write drafts directly.
 * Curated geopolitical/conflict monitoring; maps to Political Tension (default) or Armed Conflict when clear.
 * Uses same dedupe + incident pipeline as USGS/GDACS/GDELT.
 */

import { parseFeed } from "@rowanmanning/feed-parser";
import Parser from "rss-parser";
import type { IngestItem } from "@/app/api/_lib/validation";
import { supabaseAdmin } from "@/app/api/_lib/db";
import {
  createDraftEventAndMaybeCandidate,
  CreateDraftEventError,
} from "@/app/api/_lib/createDraftEvent";
import { mapIngestItemToDraftData } from "@/app/api/_lib/processIngestBatch";

const FEED_KEY = "crisiswatch";
const SOURCE_NAME = "CrisisWatch";
const DEFAULT_CATEGORY = "Political Tension" as const;

/** Minimal shape for normalized CrisisWatch items (compatible with IngestItem). */
export type CrisisWatchIngestItem = {
  feed_key: string;
  source_name: string;
  source_url: string;
  title: string;
  summary?: string;
  published_at?: string;
  occurred_at?: string;
  location?: string;
  category?: string;
  subtype?: string;
  confidence_level?: string;
};

/**
 * Map CrisisWatch content: default Political Tension unless conflict wording clearly maps to Armed Conflict.
 */
function mapToTaxonomy(text: string): { category: string; subtype?: string } {
  const lower = text.toLowerCase();
  if (/\b(air strike|airstrike|bombing|bombed)\b/.test(lower)) {
    return { category: "Armed Conflict", subtype: "Air Strike" };
  }
  if (/\b(assassination|assassinated|targeted kill)\b/.test(lower)) {
    return { category: "Armed Conflict", subtype: "Targeted Assassination" };
  }
  if (/\b(border skirmish|border clash)\b/.test(lower)) {
    return { category: "Armed Conflict", subtype: "Border Skirmish" };
  }
  if (
    /\b(battle|battles|armed conflict|military conflict|combat|clash|clashes|attack|attacks|strike|strikes)\b/.test(
      lower
    )
  ) {
    return { category: "Armed Conflict", subtype: "Battle" };
  }
  return { category: DEFAULT_CATEGORY, subtype: "Protest" };
}

type FeedItemLike = {
  link?: string | null;
  title?: string | null;
  contentSnippet?: string;
  content?: string;
  description?: string;
  pubDate?: string | null;
};

function isValidUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

function toIngestItem(item: FeedItemLike, feedKey: string): CrisisWatchIngestItem | null {
  const link = (item.link ?? "").trim();
  if (!link || !isValidUrl(link)) return null;

  const title = (item.title ?? "").trim() || "CrisisWatch";
  const description =
    typeof item.contentSnippet === "string"
      ? item.contentSnippet
      : typeof item.content === "string"
        ? item.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        : (item.description ?? "").trim();
  const summary = description.slice(0, 5000) || undefined;
  const pubDate = item.pubDate?.trim();

  const combinedText = `${title} ${description}`;
  const { category, subtype } = mapToTaxonomy(combinedText);

  return {
    feed_key: feedKey,
    source_name: SOURCE_NAME,
    source_url: link,
    title: title.slice(0, 500),
    summary,
    published_at: pubDate || undefined,
    occurred_at: pubDate || undefined,
    category,
    subtype,
    confidence_level: "High",
  };
}

/** Sanitize XML so strict parsers can handle malformed entities. */
function sanitizeXml(xml: string): string {
  return xml.replace(/&[^;#\s]+=[^;]*;/g, " ");
}

async function fetchAndParseRss(rssUrl: string): Promise<FeedItemLike[]> {
  const res = await fetch(rssUrl, {
    headers: { "User-Agent": "global-stability-mvp/1.0" },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `CrisisWatch RSS fetch failed: ${res.status} ${res.statusText} ${body.slice(0, 200)}`
    );
  }

  // Detect HTML response — indicates redirect to a non-RSS page (e.g. the feed URL has moved)
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new Error(
      `CrisisWatch RSS returned HTML instead of RSS/XML. The feed URL appears broken or removed. ` +
      `URL: ${rssUrl} — update CRISISWATCH_RSS_URL env var or the default URL in the ingest script.`
    );
  }

  const rawXml = await res.text();
  const xml = sanitizeXml(rawXml);

  try {
    const feed = parseFeed(xml);
    return (feed.items ?? []).map((item) => ({
      link: item.url ?? null,
      title: item.title ?? null,
      contentSnippet: item.description ?? undefined,
      content: item.content ?? undefined,
      description: item.description ?? undefined,
      pubDate: item.published ? new Date(item.published).toISOString() : null,
    }));
  } catch {
    try {
      const parser = new Parser();
      const feed = await parser.parseString(xml);
      return (feed.items ?? []).map((item) => ({
        link: item.link ?? null,
        title: item.title ?? null,
        contentSnippet:
          typeof item.contentSnippet === "string" ? item.contentSnippet : undefined,
        content: typeof item.content === "string" ? item.content : undefined,
        description: typeof item.description === "string" ? item.description : undefined,
        pubDate: item.pubDate ?? null,
      }));
    } catch {
      return await parseItemsFromBrokenRss(xml);
    }
  }
}

async function parseItemsFromBrokenRss(xml: string): Promise<FeedItemLike[]> {
  const itemBlockRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = itemBlockRegex.exec(xml)) !== null) {
    blocks.push("<item>" + m[1] + "</item>");
  }
  if (blocks.length === 0) return [];

  const wrapped =
    '<?xml version="1.0"?><rss version="2.0"><channel><title>CrisisWatch</title>' +
    blocks.join("") +
    "</channel></rss>";
  const parser = new Parser();
  try {
    const feed = await parser.parseString(wrapped);
    return (feed.items ?? []).map((item) => ({
      link: item.link ?? null,
      title: item.title ?? null,
      contentSnippet:
        typeof item.contentSnippet === "string" ? item.contentSnippet : undefined,
      content: typeof item.content === "string" ? item.content : undefined,
      description: typeof item.description === "string" ? item.description : undefined,
      pubDate: item.pubDate ?? null,
    }));
  } catch {
    return [];
  }
}

const log = {
  error: (msg: string, meta?: Record<string, unknown>) => console.error(msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(msg, meta),
};

export type IngestCrisisWatchOptions = {
  rssUrl?: string;
};

export async function ingestCrisisWatch(
  options: IngestCrisisWatchOptions = {}
): Promise<{ fetched: number; processed: number; skipped: number }> {
  // NOTE: The old CrisisWatch-specific feed (/crisiswatch/rss.xml, /rss/crisiswatch)
  // redirects to an HTML page as of 2026-03. The global feed (/rss) returns RSS/XML
  // but is not CrisisWatch-filtered. Set CRISISWATCH_RSS_URL to override if a working
  // CrisisWatch-specific feed becomes available.
  const rssUrl =
    (options.rssUrl ?? process.env.CRISISWATCH_RSS_URL ?? "").trim() ||
    "https://www.crisisgroup.org/rss";

  if (!rssUrl.startsWith("http")) {
    throw new Error("CRISISWATCH_RSS_URL must be a valid HTTP(S) URL");
  }

  const items = await fetchAndParseRss(rssUrl);
  const ingestItems = items
    .map((item) => toIngestItem(item, FEED_KEY))
    .filter((x): x is CrisisWatchIngestItem => x != null) as IngestItem[];

  if (ingestItems.length === 0) {
    return { fetched: 0, processed: 0, skipped: 0 };
  }

  let processed = 0;
  let skipped = 0;

  for (const item of ingestItems) {
    const title = (item.title ?? "").trim();
    const sourceUrl = (item.source_url ?? "").trim();
    if (!title || !sourceUrl) {
      skipped++;
      continue;
    }

    const { data: existing } = await supabaseAdmin
      .from("ingestion_items")
      .select("id")
      .eq("source_url", item.source_url)
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("ingestion_items")
      .insert({
        feed_key: FEED_KEY,
        source_url: item.source_url,
        source_name: SOURCE_NAME,
        payload: item as unknown as Record<string, unknown>,
        status: "New",
      })
      .select("id")
      .single();

    if (insertErr) {
      if (insertErr.code === "23505") {
        skipped++;
        continue;
      }
      log.error("ingestion_items insert failed", {
        error: insertErr.message,
        source_url: item.source_url,
      });
      skipped++;
      continue;
    }

    const draftData = mapIngestItemToDraftData(item as IngestItem);
    try {
      await createDraftEventAndMaybeCandidate({
        data: draftData,
        createdBy: null,
      });
      await supabaseAdmin
        .from("ingestion_items")
        .update({ status: "Processed" })
        .eq("id", inserted.id);
      processed++;
    } catch (err) {
      if (err instanceof CreateDraftEventError) {
        log.error("Draft create failed (CreateDraftEventError)", {
          message: err.message,
          status: err.status,
          source_url: item.source_url,
        });
      } else {
        log.warn("Draft create failed for item", {
          source_url: item.source_url,
          message: err instanceof Error ? err.message : "Unknown",
        });
      }
      await supabaseAdmin
        .from("ingestion_items")
        .update({ status: "Skipped" })
        .eq("id", inserted.id);
      skipped++;
    }
  }

  return {
    fetched: ingestItems.length,
    processed,
    skipped,
  };
}
