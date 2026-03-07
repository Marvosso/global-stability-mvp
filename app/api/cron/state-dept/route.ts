/**
 * Vercel Cron: US State Department Travel Advisories ingestion.
 * GET /api/cron/state-dept — requires x-cron-key or Authorization: Bearer, runs ingestStateDept().
 * Returns { fetched, processed, skipped }.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronKey } from "@/lib/cronAuth";
import { ingestStateDept } from "@/lib/ingest/stateDept";

export async function GET(request: NextRequest) {
  const auth = verifyCronKey(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  try {
    const result = await ingestStateDept();
    return NextResponse.json({
      fetched: result.fetched,
      processed: result.processed,
      skipped: result.skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "State Dept ingest failed", message },
      { status: 500 }
    );
  }
}
