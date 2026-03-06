/**
 * CrisisWatch RSS ingestion script.
 * Fetches CrisisWatch RSS feed, parses items, normalizes to ingest format,
 * POSTs to /api/internal/ingest.
 *
 * Tries @rowanmanning/feed-parser first; falls back to rss-parser with
 * entity sanitization when the feed is too malformed.
 *
 * Env:
 * - INGEST_API_KEY — required for POST to ingest API
 * - INGEST_BASE_URL or APP_BASE_URL — optional, default http://localhost:3000
 * - CRISISWATCH_RSS_URL — optional, default https://www.crisisgroup.org/crisiswatch/rss.xml
 */

import "dotenv/config";
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { parseFeed } from "@rowanmanning/feed-parser";
import Parser from "rss-parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
config({ path: path.join(projectRoot, ".env.local") });

const DEFAULT_RSS_URL = "https://www.crisisgroup.org/crisiswatch/rss.xml";
const SOURCE_NAME = "CrisisWatch";

type IngestItem = {
  feed_key: string;
  source_name: string;
  source_url: string;
  title: string;
  summary?: string;
  published_at?: string;
  occurred_at?: string;
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

function normalizeItem(item: FeedItemLike, feedKey: string): IngestItem | null {
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

  return {
    feed_key: feedKey,
    source_name: SOURCE_NAME,
    source_url: link,
    title: title.slice(0, 500),
    summary,
    published_at: pubDate || undefined,
    occurred_at: pubDate || undefined,
  };
}

/** Sanitize XML so strict parsers can handle malformed entities. */
function sanitizeXml(xml: string): string {
  return xml.replace(/&[^;#\s]+=[^;]*;/g, " ");
}

async function fetchAndParseRss(): Promise<FeedItemLike[]> {
  const rssUrl =
    (process.env.CRISISWATCH_RSS_URL ?? DEFAULT_RSS_URL).trim() || DEFAULT_RSS_URL;

  const res = await fetch(rssUrl, {
    headers: { "User-Agent": "global-stability-mvp/1.0" },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[CrisisWatch] Fetch failed: ${res.status} ${res.statusText}`);
    console.error(`[CrisisWatch] Response: ${body.slice(0, 500)}`);
    throw new Error(`CrisisWatch RSS fetch failed: ${res.status} ${res.statusText}`);
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
    // Fallback 1: rss-parser with sanitized XML
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
      // Fallback 2: extract <item>...</item> blocks and parse as minimal RSS
      return await parseItemsFromBrokenRss(xml);
    }
  }
}

/** Extract item blocks from broken RSS and parse with rss-parser. */
function parseItemsFromBrokenRss(xml: string): Promise<FeedItemLike[]> {
  const itemBlockRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = itemBlockRegex.exec(xml)) !== null) {
    blocks.push("<item>" + m[1] + "</item>");
  }
  if (blocks.length === 0) return Promise.resolve([]);

  const wrapped =
    '<?xml version="1.0"?><rss version="2.0"><channel><title>CrisisWatch</title>' +
    blocks.join("") +
    "</channel></rss>";
  const parser = new Parser();
  return parser.parseString(wrapped).then(
    (feed) =>
      (feed.items ?? []).map((item) => ({
        link: item.link ?? null,
        title: item.title ?? null,
        contentSnippet:
          typeof item.contentSnippet === "string" ? item.contentSnippet : undefined,
        content: typeof item.content === "string" ? item.content : undefined,
        description: typeof item.description === "string" ? item.description : undefined,
        pubDate: item.pubDate ?? null,
      })),
    () => []
  );
}

export type RunIngestResult = { fetched: number; processed: number; skipped: number };

export async function runIngest(): Promise<RunIngestResult | null> {
  const { getFeedConfig, updateFeedLastRun } = await import("@/lib/feeds/getFeedConfig");
  const feedConfig = await getFeedConfig("crisiswatch");
  if (!feedConfig || !feedConfig.enabled) return null;
  const feedKey = feedConfig.feed_key;

  const ingestKey = (process.env.INGEST_API_KEY ?? "").trim();
  if (!ingestKey) throw new Error("INGEST_API_KEY is required to POST to the ingest API. Set it in .env.local.");

  const ingestBaseUrl =
    (process.env.INGEST_BASE_URL ?? process.env.APP_BASE_URL ?? "http://localhost:3000")
      .trim()
      .replace(/\/$/, "") || "http://localhost:3000";

  const items = await fetchAndParseRss();
  const normalized = items
    .map((item) => normalizeItem(item, feedKey))
    .filter((x): x is IngestItem => x !== null);

  if (normalized.length === 0) return { fetched: 0, processed: 0, skipped: 0 };

  const ingestUrl = `${ingestBaseUrl}/api/internal/ingest`;
  const res = await fetch(ingestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-ingest-key": ingestKey },
    body: JSON.stringify({ items: normalized }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ingest API failed: ${res.status} ${res.statusText} ${text.slice(0, 300)}`);
  }
  const result = (await res.json()) as { processed?: number; skipped?: number };
  await updateFeedLastRun("crisiswatch");
  return {
    fetched: normalized.length,
    processed: result.processed ?? 0,
    skipped: result.skipped ?? 0,
  };
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
