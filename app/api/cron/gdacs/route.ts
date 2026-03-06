/**
 * Vercel Cron: GDACS disaster ingestion.
 * GET /api/cron/gdacs — requires x-cron-key header, runs ingestGDACS().
 * Returns { fetched, processed, skipped }.
 */

import { NextRequest, NextResponse } from "next/server";
import { ingestGDACS } from "@/lib/ingest/gdacs";

function verifyCronKey(request: NextRequest): { ok: true } | { ok: false; status: 401; body: object } {
  const key = (process.env.CRON_KEY ?? "").trim();
  if (!key) {
    return { ok: false, status: 401, body: { error: "CRON_KEY not configured" } };
  }
  const header = request.headers.get("x-cron-key");
  if (header !== key) {
    return { ok: false, status: 401, body: { error: "Unauthorized" } };
  }
  return { ok: true };
}

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
    return NextResponse.json(
      { error: "GDACS ingest failed", message },
      { status: 500 }
    );
  }
}
