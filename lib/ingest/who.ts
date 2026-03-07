/**
 * WHO Disease Outbreak News ingestion.
 * Fetches the WHO DON RSS feed and maps items to Natural Disaster events.
 * Feed: https://www.who.int/feeds/entity/csr/don/en/rss.xml
 */

import { ingestGenericRss } from "./genericRss";

const DEFAULT_URL = "https://www.who.int/feeds/entity/csr/don/en/rss.xml";

export async function ingestWHO(
  options: { rssUrl?: string } = {}
): Promise<{ fetched: number; processed: number; skipped: number }> {
  const rssUrl =
    (options.rssUrl ?? process.env.WHO_OUTBREAKS_URL ?? "").trim() || DEFAULT_URL;

  return ingestGenericRss({
    feed_key: "who_outbreaks",
    source_name: "WHO Disease Outbreaks",
    rss_url: rssUrl,
    default_category: "Natural Disaster",
  });
}
