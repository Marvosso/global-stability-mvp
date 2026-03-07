/**
 * Vercel Cron: WHO Disease Outbreak News ingestion.
 * GET /api/cron/who — requires x-cron-key or Authorization: Bearer, runs ingestWHO().
 * Returns { fetched, processed, skipped }.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronKey } from "@/lib/cronAuth";
import { ingestWHO } from "@/lib/ingest/who";

export async function GET(request: NextRequest) {
  const auth = verifyCronKey(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  try {
    const result = await ingestWHO();
    return NextResponse.json({
      fetched: result.fetched,
      processed: result.processed,
      skipped: result.skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "WHO ingest failed", message },
      { status: 500 }
    );
  }
}
