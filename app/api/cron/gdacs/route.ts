/**
 * Vercel Cron: GDACS disaster ingestion.
 * GET /api/cron/gdacs — requires x-cron-key or Authorization: Bearer, runs ingestGDACS().
 * Returns { fetched, processed, skipped }.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronKey } from "@/lib/cronAuth";
import { ingestGDACS } from "@/lib/ingest/gdacs";

export async function GET(request: NextRequest) {
  const auth = verifyCronKey(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  try {
    const result = await ingestGDACS();
    return NextResponse.json({
      fetched: result.fetched,
      processed: result.processed,
      skipped: result.skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const isConfigError = /GDACS_RSS_URL.*required/i.test(message);
    return NextResponse.json(
      { error: "GDACS ingest failed", message },
      { status: isConfigError ? 503 : 500 }
    );
  }
}
