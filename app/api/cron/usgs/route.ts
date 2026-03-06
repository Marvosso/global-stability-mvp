/**
 * Vercel Cron: USGS earthquake ingestion.
 * GET /api/cron/usgs — requires x-cron-key or Authorization: Bearer, runs ingestUSGS().
 * Returns { fetched, processed, skipped }.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronKey } from "@/lib/cronAuth";
import { ingestUSGS } from "@/lib/ingest/usgs";

export async function GET(request: NextRequest) {
  const auth = verifyCronKey(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  try {
    const result = await ingestUSGS();
    return NextResponse.json({
      fetched: result.fetched,
      processed: result.processed,
      skipped: result.skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "USGS ingest failed", message },
      { status: 500 }
    );
  }
}
