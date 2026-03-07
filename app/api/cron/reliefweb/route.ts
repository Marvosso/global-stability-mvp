/**
 * Vercel Cron: ReliefWeb Disasters API ingestion.
 * GET /api/cron/reliefweb — requires x-cron-key or Authorization: Bearer, runs ingestReliefWeb().
 * Returns { fetched, processed, skipped }.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronKey } from "@/lib/cronAuth";
import { ingestReliefWeb } from "@/lib/ingest/reliefweb";

export async function GET(request: NextRequest) {
  const auth = verifyCronKey(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  try {
    const result = await ingestReliefWeb();
    return NextResponse.json({
      fetched: result.fetched,
      processed: result.processed,
      skipped: result.skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "ReliefWeb ingest failed", message },
      { status: 500 }
    );
  }
}
