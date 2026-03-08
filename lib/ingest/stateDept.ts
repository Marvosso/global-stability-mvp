/**
 * US State Department Travel Advisories ingestion.
 * Fetches the State Dept travel advisories RSS feed.
 * Items indicate elevated country-level political risk (level 1–4 advisories).
 * Feed: https://travel.state.gov/content/travel/en/traveladvisories/RSS.xml
 */

import { ingestGenericRss } from "./genericRss";

const DEFAULT_URL =
  "https://travel.state.gov/_res/rss/TAsTWs.xml";

export async function ingestStateDept(
  options: { rssUrl?: string } = {}
): Promise<{ fetched: number; processed: number; skipped: number }> {
  const rssUrl =
    (options.rssUrl ?? process.env.STATE_DEPT_RSS_URL ?? "").trim() || DEFAULT_URL;

  return ingestGenericRss({
    feed_key: "state_dept_advisories",
    source_name: "US State Dept Travel Advisories",
    rss_url: rssUrl,
    default_category: "Political Tension",
    default_subtype: "Government Crisis",
    mapTaxonomy: (title) => {
      const lower = title.toLowerCase();
      // Level 4: Do Not Travel → highest risk
      if (/level\s*4|do not travel/.test(lower)) {
        return { category: "Armed Conflict", subtype: "Battle" };
      }
      // Level 3: Reconsider Travel
      if (/level\s*3|reconsider travel/.test(lower)) {
        return { category: "Political Tension", subtype: "Government Crisis" };
      }
      return null; // use defaults for level 1–2
    },
  });
}
