/**
 * Feed registry: check if a feed is enabled and get its config (feed_key, category_default, severity_default).
 * Used by ingest scripts to skip disabled feeds and use registry feed_key.
 */

import { supabaseAdmin } from "@/app/api/_lib/db";

export type FeedConfig = {
  enabled: boolean;
  feed_key: string;
  category_default: string | null;
  severity_default: string | null;
  last_run: string | null;
};

export async function getFeedConfig(feedKey: string): Promise<FeedConfig | null> {
  const { data, error } = await supabaseAdmin
    .from("feeds")
    .select("enabled, feed_key, category_default, severity_default, last_run")
    .eq("feed_key", feedKey)
    .maybeSingle();

  if (error || !data) return null;
  return {
    enabled: Boolean(data.enabled),
    feed_key: String(data.feed_key),
    category_default: data.category_default != null ? String(data.category_default) : null,
    severity_default: data.severity_default != null ? String(data.severity_default) : null,
    last_run: data.last_run != null ? String(data.last_run) : null,
  };
}

export async function updateFeedLastRun(feedKey: string): Promise<void> {
  await supabaseAdmin
    .from("feeds")
    .update({ last_run: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("feed_key", feedKey);
}
