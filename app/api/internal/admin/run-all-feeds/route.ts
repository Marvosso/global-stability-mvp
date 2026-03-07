/**
 * Admin-only: run all configured feed ingestions sequentially.
 * POST /api/internal/admin/run-all-feeds
 * Returns { results: Record<feed_key, { fetched, processed, skipped } | { error }> }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { ingestUSGS } from "@/lib/ingest/usgs";
import { ingestGDACS } from "@/lib/ingest/gdacs";
import { ingestGDELT } from "@/lib/ingest/gdelt";
import { ingestCrisisWatch } from "@/lib/ingest/crisiswatch";
import { forbidden, internalError, unauthorized } from "@/lib/apiError";

type FeedResult =
  | { fetched: number; processed: number; skipped: number }
  | { error: string };

const FEEDS: { feed_key: string; run: () => Promise<{ fetched: number; processed: number; skipped: number }> }[] = [
  { feed_key: "usgs_eq", run: () => ingestUSGS() },
  { feed_key: "gdacs_rss", run: () => ingestGDACS() },
  { feed_key: "gdelt", run: () => ingestGDELT() },
  { feed_key: "crisiswatch", run: () => ingestCrisisWatch() },
];

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 401) return unauthorized();
    if (status === 403) return forbidden("Admin only");
    throw err;
  }

  const results: Record<string, FeedResult> = {};

  for (const { feed_key, run } of FEEDS) {
    try {
      const result = await run();
      results[feed_key] = {
        fetched: result.fetched,
        processed: result.processed,
        skipped: result.skipped,
      };
    } catch (err) {
      results[feed_key] = {
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  return NextResponse.json({ results });
}
