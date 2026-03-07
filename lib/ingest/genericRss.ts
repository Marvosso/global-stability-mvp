/**
 * Generic RSS ingestion engine: shared fetch/parse/dedupe/draft logic for any RSS-based feed.
 * Wraps the same 3-tier parser used by CrisisWatch (parseFeed → rss-parser → regex fallback).
 * New RSS-based feeds only need a small config wrapper on top of this.
 */

import { parseFeed } from "@rowanmanning/feed-parser";
import Parser from "rss-parser";
import type { IngestItem } from "@/app/api/_lib/validation";
import type { event_category, event_subtype } from "@/app/api/_lib/enums";
import { supabaseAdmin } from "@/app/api/_lib/db";
import {
  createDraftEventAndMaybeCandidate,
  CreateDraftEventError,
} from "@/app/api/_lib/createDraftEvent";
import { mapIngestItemToDraftData } from "@/app/api/_lib/processIngestBatch";

export type EventCategory = (typeof event_category)[number];
export type EventSubtype = (typeof event_subtype)[number];

export type GenericRssFeedConfig = {
  feed_key: string;
  source_name: string;
  rss_url: string;
  /** Default taxonomy if no custom mapper matches. Must be a valid event_category value. */
  default_category: EventCategory;
  /** Optional default subtype. Must be a valid event_subtype value. */
  default_subtype?: EventSubtype;
  /** Optional per-item taxonomy override. Return null to use defaults. */
  mapTaxonomy?: (title: string, description: string) => { category: EventCategory; subtype?: EventSubtype } | null;
};

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

function sanitizeXml(xml: string): string {
  return xml.replace(/&[^;#\s]+=[^;]*;/g, " ");
}

async function fetchAndParseRss(rssUrl: string): Promise<FeedItemLike[]> {
  const res = await fetch(rssUrl, {
    headers: { "User-Agent": "global-stability-mvp/1.0" },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`RSS fetch failed: ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new Error(
      `RSS URL returned HTML instead of RSS/XML. The feed URL may have moved or been removed. URL: ${rssUrl}`
    );
  }

  const rawXml = await res.text();
  const xml = sanitizeXml(rawXml);

  // Tier 1: @rowanmanning/feed-parser
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
    // fall through
  }

  // Tier 2: rss-parser
  try {
    const parser = new Parser();
    const feed = await parser.parseString(xml);
    return (feed.items ?? []).map((item) => ({
      link: item.link ?? null,
      title: item.title ?? null,
      contentSnippet: typeof item.contentSnippet === "string" ? item.contentSnippet : undefined,
      content: typeof item.content === "string" ? item.content : undefined,
      description: typeof item.description === "string" ? item.description : undefined,
      pubDate: item.pubDate ?? null,
    }));
  } catch {
    // fall through
  }

  // Tier 3: regex fallback for malformed XML
  return parseItemsFromBrokenRss(xml);
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
    '<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title>' +
    blocks.join("") +
    "</channel></rss>";
  try {
    const parser = new Parser();
    const feed = await parser.parseString(wrapped);
    return (feed.items ?? []).map((item) => ({
      link: item.link ?? null,
      title: item.title ?? null,
      contentSnippet: typeof item.contentSnippet === "string" ? item.contentSnippet : undefined,
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

export async function ingestGenericRss(
  config: GenericRssFeedConfig
): Promise<{ fetched: number; processed: number; skipped: number }> {
  const { feed_key, source_name, rss_url, default_category, default_subtype, mapTaxonomy } = config;

  const items = await fetchAndParseRss(rss_url);

  const ingestItems: IngestItem[] = items
    .map((item): IngestItem | null => {
      const link = (item.link ?? "").trim();
      if (!link || !isValidUrl(link)) return null;

      const title = (item.title ?? "").trim() || source_name;
      const description =
        typeof item.contentSnippet === "string"
          ? item.contentSnippet
          : typeof item.content === "string"
            ? item.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
            : (item.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const summary = description.slice(0, 5000) || undefined;
      const pubDate = item.pubDate?.trim();

      const taxonomy =
        mapTaxonomy?.(title, description) ?? { category: default_category, subtype: default_subtype };

      return {
        feed_key,
        source_name,
        source_url: link,
        title: title.slice(0, 500),
        summary,
        published_at: pubDate || undefined,
        occurred_at: pubDate || undefined,
        category: taxonomy.category,
        subtype: taxonomy.subtype,
        confidence_level: "High",
      } as IngestItem;
    })
    .filter((x): x is IngestItem => x != null);

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
        feed_key,
        source_url: item.source_url,
        source_name,
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

    const draftData = mapIngestItemToDraftData(item);
    try {
      await createDraftEventAndMaybeCandidate({ data: draftData, createdBy: null });
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
        log.warn("Draft create failed", {
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

  return { fetched: ingestItems.length, processed, skipped };
}
