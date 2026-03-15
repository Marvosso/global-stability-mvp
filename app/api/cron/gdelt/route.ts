/**
 * Vercel Cron: GDELT conflict-focused ingestion (15-min feed or daily fallback).
 * GET /api/cron/gdelt — requires x-cron-key or Authorization: Bearer, runs ingestGDELTDaily().
 * Schedule: daily at 8 AM. Returns { fetched, processed, skipped }.
 */

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
import { verifyCronKey } from "@/lib/cronAuth";
import { ingestGDELTDaily } from "@/lib/ingest/gdeltDaily";

export async function GET(request: NextRequest) {
  const auth = verifyCronKey(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  try {
    const result = await ingestGDELTDaily();
    return NextResponse.json({
      fetched: result.fetched,
      processed: result.processed,
      skipped: result.skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "GDELT daily ingest failed", message },
      { status: 500 }
    );
  }
}
