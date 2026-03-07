/**
 * GDACS RSS ingestion: fetch feed, normalize to ingest items, write drafts directly.
 * Used by cron route and CLI script. No HTTP call to ingest API; uses supabaseAdmin and createDraftEventAndMaybeCandidate.
 */

import Parser from "rss-parser";
import type { IngestItem } from "@/app/api/_lib/validation";
import { supabaseAdmin } from "@/app/api/_lib/db";
import {
  createDraftEventAndMaybeCandidate,
  CreateDraftEventError,
} from "@/app/api/_lib/createDraftEvent";
import { mapIngestItemToDraftData } from "@/app/api/_lib/processIngestBatch";

const FEED_KEY = "gdacs_rss";
const SOURCE_NAME = "GDACS";

/** Minimal shape for normalized GDACS items (compatible with IngestItem). */
export type GdacsIngestItem = {
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
};

const EVENTTYPE_TO_SUBTYPE: Record<string, "Earthquake" | "Flood" | "Cyclone" | "Drought"> = {
  EQ: "Earthquake",
  FL: "Flood",
  TC: "Cyclone",
  DR: "Drought",
};

type RssItem = {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
  gdacsLatitude?: string;
  gdacsLongitude?: string;
};

function parseEventTypeFromUrl(url: string): "Earthquake" | "Flood" | "Cyclone" | "Drought" | null {
  try {
    const u = new URL(url);
    const eventtype = u.searchParams.get("eventtype")?.toUpperCase();
    if (eventtype && eventtype in EVENTTYPE_TO_SUBTYPE) {
      return EVENTTYPE_TO_SUBTYPE[eventtype];
    }
  } catch {
    // ignore
  }
  return null;
}

function parseRssItemsFromXml(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemBlock = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  const tag = (name: string) => new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i");
  const nsTag = (name: string) => new RegExp(`<(?:[a-z]+:)?${name}[^>]*>([\\s\\S]*?)</(?:[a-z]+:)?${name}>`, "i");
  let m: RegExpExecArray | null;
  while ((m = itemBlock.exec(xml)) !== null) {
    const block = m[1];
    const titleMatch = tag("title").exec(block);
    const linkMatch = tag("link").exec(block) || tag("guid").exec(block);
    const pubMatch = tag("pubDate").exec(block) || tag("date").exec(block);
    const descMatch = tag("description").exec(block);
    const latMatch = nsTag("latitude").exec(block);
    const lngMatch = nsTag("longitude").exec(block);
    const title = (titleMatch?.[1] ?? "").replace(/<[^>]+>/g, "").replace(/^\s+|\s+$/g, "");
    const link = (linkMatch?.[1] ?? "").replace(/^\s+|\s+$/g, "");
    const pubDate = pubMatch?.[1]?.replace(/^\s+|\s+$/g, "");
    const description = descMatch?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const gdacsLatitude = latMatch?.[1]?.replace(/^\s+|\s+$/g, "");
    const gdacsLongitude = lngMatch?.[1]?.replace(/^\s+|\s+$/g, "");
    if (link && link.startsWith("http")) {
      items.push({ title, link, pubDate, description, gdacsLatitude, gdacsLongitude });
    }
  }
  return items;
}

function toIngestItem(item: RssItem): GdacsIngestItem {
  const title = (item.title || "Untitled").trim().slice(0, 500);
  const summary = (item.description ?? item.title ?? "").trim().slice(0, 5000) || title;
  const sourceUrl = item.link.trim();
  const subtype = parseEventTypeFromUrl(sourceUrl);

  let location: string | undefined;
  if (item.gdacsLatitude && item.gdacsLongitude) {
    const lat = parseFloat(item.gdacsLatitude);
    const lng = parseFloat(item.gdacsLongitude);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      location = `${lat},${lng}`;
    }
  }

  const out: GdacsIngestItem = {
    feed_key: FEED_KEY,
    source_name: SOURCE_NAME,
    source_url: sourceUrl,
    title,
    summary,
    ...(item.pubDate && { published_at: item.pubDate, occurred_at: item.pubDate }),
    ...(location && { location }),
  };
  if (subtype) {
    out.category = "Natural Disaster";
    out.subtype = subtype;
  }
  return out;
}

const log = {
  error: (msg: string, meta?: Record<string, unknown>) => console.error(msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(msg, meta),
};

export type IngestGDACSOptions = {
  rssUrl?: string;
};

export async function ingestGDACS(
  options: IngestGDACSOptions = {}
): Promise<{ fetched: number; processed: number; skipped: number }> {
  const rssUrl = (options.rssUrl ?? process.env.GDACS_RSS_URL ?? "").trim();
  if (!rssUrl || !rssUrl.startsWith("http")) {
    throw new Error("GDACS_RSS_URL is required and must be an HTTP(S) URL");
  }

  const res = await fetch(rssUrl, {
    headers: { "User-Agent": "global-stability-mvp/1.0" },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GDACS RSS fetch failed: ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
  }

  const xml = await res.text();
  const looksLikeRss = /<rss\s|<feed\s|<\?xml/i.test(xml) || xml.trimStart().startsWith("<");

  let items: RssItem[];
  try {
    const parser = new Parser({
      customFields: {
        item: [
          ["gdacs:latitude", "gdacsLatitude"],
          ["gdacs:longitude", "gdacsLongitude"],
        ],
      },
    });
    const feed = await parser.parseString(xml);
    items = (feed.items ?? [])
      .map((i) => {
        const raw = (i as unknown) as Record<string, unknown>;
        return {
          title: (i.title ?? "").trim(),
          link: (i.link ?? "").trim(),
          pubDate: i.pubDate,
          description:
            typeof i.contentSnippet === "string" ? i.contentSnippet : (i.content ?? undefined),
          gdacsLatitude: typeof raw.gdacsLatitude === "string" ? raw.gdacsLatitude : undefined,
          gdacsLongitude: typeof raw.gdacsLongitude === "string" ? raw.gdacsLongitude : undefined,
        };
      })
      .filter((i) => i.link && i.link.startsWith("http"));
  } catch {
    items = parseRssItemsFromXml(xml);
  }

  if (!looksLikeRss || items.length === 0) {
    return { fetched: 0, processed: 0, skipped: 0 };
  }

  const ingestItems = items.map(toIngestItem);
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
      log.error("ingestion_items insert failed", { error: insertErr.message, source_url: item.source_url });
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
