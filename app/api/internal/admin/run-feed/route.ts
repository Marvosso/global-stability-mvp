/**
 * Admin-only: run a feed ingestion (USGS or GDACS).
 * POST /api/internal/admin/run-feed — body { feed_key }.
 * Returns { fetched, processed, skipped }.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { ingestUSGS } from "@/lib/ingest/usgs";
import { ingestGDACS } from "@/lib/ingest/gdacs";
import { badRequest, forbidden, internalError, unauthorized } from "@/lib/apiError";

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

  const isUsgs = feedKey === "usgs_eq" || feedKey === "usgs";
  const isGdacs = feedKey === "gdacs_rss" || feedKey === "gdacs";

  if (!isUsgs && !isGdacs) {
    return badRequest("feed_key must be usgs_eq or gdacs");
  }

  try {
    if (isUsgs) {
      const result = await ingestUSGS();
      return NextResponse.json({
        fetched: result.fetched,
        processed: result.processed,
        skipped: result.skipped,
      });
    }

    const result = await ingestGDACS();
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
