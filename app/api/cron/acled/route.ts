/**
 * Vercel Cron: ACLED conflict ingestion (beta).
 * GET /api/cron/acled — requires x-cron-key or Authorization: Bearer, runs ingestACLED().
 * Schedule: daily. Ukraine, Israel, Iran; last 7 days; auto-published as Armed Conflict.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronKey } from "@/lib/cronAuth";
import { ingestACLED } from "@/lib/ingest/acled";

export async function GET(request: NextRequest) {
  const auth = verifyCronKey(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  try {
    const result = await ingestACLED();
    return NextResponse.json({
      fetched: result.fetched,
      processed: result.processed,
      skipped: result.skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "ACLED ingest failed", message },
      { status: 500 }
    );
  }
}
