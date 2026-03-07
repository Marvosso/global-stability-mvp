/**
 * Admin-only: run a single feed ingestion.
 * POST /api/internal/admin/run-feed — body { feed_key }.
 * Returns { fetched, processed, skipped }.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { ingestUSGS } from "@/lib/ingest/usgs";
import { ingestGDACS } from "@/lib/ingest/gdacs";
import { ingestGDELT } from "@/lib/ingest/gdelt";
import { ingestCrisisWatch } from "@/lib/ingest/crisiswatch";
import { badRequest, forbidden, internalError, unauthorized } from "@/lib/apiError";

const SUPPORTED_FEEDS = ["usgs_eq", "usgs", "gdacs_rss", "gdacs", "gdelt", "crisiswatch"] as const;

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 401) return unauthorized();
    if (status === 403) return forbidden("Admin only");
    throw err;
  }

  let body: { feed_key?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const feedKey = (body.feed_key ?? "").trim().toLowerCase();
  if (!feedKey) {
    return badRequest("feed_key is required");
  }

  if (!SUPPORTED_FEEDS.includes(feedKey as typeof SUPPORTED_FEEDS[number])) {
    return badRequest(`feed_key must be one of: ${SUPPORTED_FEEDS.join(", ")}`);
  }

  try {
    let result: { fetched: number; processed: number; skipped: number };

    if (feedKey === "usgs_eq" || feedKey === "usgs") {
      result = await ingestUSGS();
    } else if (feedKey === "gdacs_rss" || feedKey === "gdacs") {
      result = await ingestGDACS();
    } else if (feedKey === "gdelt") {
      result = await ingestGDELT();
    } else {
      result = await ingestCrisisWatch();
    }

    return NextResponse.json({
      fetched: result.fetched,
      processed: result.processed,
      skipped: result.skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return internalError(message);
  }
}
