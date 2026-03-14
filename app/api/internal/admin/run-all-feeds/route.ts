/**
 * Admin-only: run all configured feed ingestions in parallel.
 * POST /api/internal/admin/run-all-feeds
 * Returns { results: Record<feed_key, { fetched, processed, skipped } | { error }> }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { ingestUSGS } from "@/lib/ingest/usgs";
import { ingestGDACS } from "@/lib/ingest/gdacs";
import { ingestGDELT } from "@/lib/ingest/gdelt";
import { ingestCrisisWatch } from "@/lib/ingest/crisiswatch";
import { ingestWHO } from "@/lib/ingest/who";
import { ingestStateDept } from "@/lib/ingest/stateDept";
import { ingestReliefWeb } from "@/lib/ingest/reliefweb";
import { ingestGDELTDaily } from "@/lib/ingest/gdeltDaily";
import { ingestACLED } from "@/lib/ingest/acled";
import { forbidden, internalError, unauthorized } from "@/lib/apiError";

export const maxDuration = 60;

const FEED_TIMEOUT_MS = 50_000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${FEED_TIMEOUT_MS / 1000}s`)),
        FEED_TIMEOUT_MS
      )
    ),
  ]);
}

type FeedResult =
  | { fetched: number; processed: number; skipped: number }
  | { error: string };

const FEEDS: { feed_key: string; label: string; run: () => Promise<{ fetched: number; processed: number; skipped: number }> }[] = [
  { feed_key: "usgs_eq", label: "USGS", run: () => ingestUSGS() },
  { feed_key: "gdacs_rss", label: "GDACS", run: () => ingestGDACS() },
  { feed_key: "gdelt", label: "GDELT", run: () => ingestGDELT() },
  { feed_key: "gdelt_events", label: "GDELT Daily", run: () => ingestGDELTDaily() },
  { feed_key: "acled_conflicts", label: "ACLED", run: () => ingestACLED() },
  { feed_key: "crisiswatch", label: "CrisisWatch", run: () => ingestCrisisWatch() },
  { feed_key: "who_outbreaks", label: "WHO", run: () => ingestWHO() },
  { feed_key: "state_dept_advisories", label: "State Dept", run: () => ingestStateDept() },
  { feed_key: "reliefweb_disasters", label: "ReliefWeb", run: () => ingestReliefWeb() },
];

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 401) return unauthorized();
    if (status === 403) return forbidden("Admin only");
    throw err;
  }

  const settled = await Promise.allSettled(
    FEEDS.map(({ label, run }) => withTimeout(run(), label))
  );

  const results: Record<string, FeedResult> = {};
  FEEDS.forEach(({ feed_key }, i) => {
    const outcome = settled[i];
    if (outcome.status === "fulfilled") {
      results[feed_key] = {
        fetched: outcome.value.fetched,
        processed: outcome.value.processed,
        skipped: outcome.value.skipped,
      };
    } else {
      results[feed_key] = {
        error: outcome.reason instanceof Error ? outcome.reason.message : "Unknown error",
      };
    }
  });

  return NextResponse.json({ results });
}
