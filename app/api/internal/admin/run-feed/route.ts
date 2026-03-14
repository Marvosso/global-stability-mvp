/**
 * Admin-only: run a single feed ingestion.
 * POST /api/internal/admin/run-feed — body { feed_key }.
 * Returns { fetched, processed, skipped }.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { ingestUSGS } from "@/lib/ingest/usgs";
import { ingestGDACS } from "@/lib/ingest/gdacs";
import { ingestGDELT } from "@/lib/ingest/gdelt";
import { ingestCrisisWatch } from "@/lib/ingest/crisiswatch";
import { ingestStateDept } from "@/lib/ingest/stateDept";
import { ingestReliefWeb } from "@/lib/ingest/reliefweb";
import { ingestGDELTDaily } from "@/lib/ingest/gdeltDaily";
import { badRequest, forbidden, internalError, unauthorized } from "@/lib/apiError";

// Allow up to 60s on Vercel Pro (each feed makes external HTTP calls + DB writes)
export const maxDuration = 60;

const SUPPORTED_FEEDS = ["usgs_eq", "usgs", "gdacs_rss", "gdacs", "gdelt", "gdelt_events", "crisiswatch", "state_dept_advisories", "reliefweb_disasters"] as const;

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

  if (!SUPPORTED_FEEDS.includes(feedKey as typeof SUPPORTED_FEEDS[number])) {
    return badRequest(`feed_key must be one of: ${SUPPORTED_FEEDS.join(", ")}`);
  }

  // #region agent log
  fetch("http://127.0.0.1:7858/ingest/4ea7f127-3afa-4a64-b2bb-235c0c1420f9", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "06fa83" },
    body: JSON.stringify({
      sessionId: "06fa83",
      location: "run-feed/route.ts:entry",
      message: "run-feed request validated",
      data: { feed_key: feedKey },
      hypothesisId: "H1",
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  let currentIngest = "none";
  try {
    let result: { fetched: number; processed: number; skipped: number };

    if (feedKey === "usgs_eq" || feedKey === "usgs") {
      currentIngest = "USGS";
      // #region agent log
      fetch("http://127.0.0.1:7858/ingest/4ea7f127-3afa-4a64-b2bb-235c0c1420f9", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "06fa83" },
        body: JSON.stringify({
          sessionId: "06fa83",
          location: "run-feed/route.ts:ingest_start",
          message: "ingest started",
          data: { feed_key: feedKey, ingest_name: currentIngest },
          hypothesisId: "H3",
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      result = await withTimeout(ingestUSGS(), "USGS");
    } else if (feedKey === "gdacs_rss" || feedKey === "gdacs") {
      currentIngest = "GDACS";
      // #region agent log
      fetch("http://127.0.0.1:7858/ingest/4ea7f127-3afa-4a64-b2bb-235c0c1420f9", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "06fa83" },
        body: JSON.stringify({
          sessionId: "06fa83",
          location: "run-feed/route.ts:ingest_start",
          message: "ingest started",
          data: { feed_key: feedKey, ingest_name: currentIngest },
          hypothesisId: "H3",
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      result = await withTimeout(ingestGDACS(), "GDACS");
    } else if (feedKey === "gdelt") {
      currentIngest = "GDELT";
      // #region agent log
      fetch("http://127.0.0.1:7858/ingest/4ea7f127-3afa-4a64-b2bb-235c0c1420f9", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "06fa83" },
        body: JSON.stringify({
          sessionId: "06fa83",
          location: "run-feed/route.ts:ingest_start",
          message: "ingest started",
          data: { feed_key: feedKey, ingest_name: currentIngest },
          hypothesisId: "H3",
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      result = await withTimeout(ingestGDELT(), "GDELT");
    } else if (feedKey === "state_dept_advisories") {
      currentIngest = "StateDept";
      // #region agent log
      fetch("http://127.0.0.1:7858/ingest/4ea7f127-3afa-4a64-b2bb-235c0c1420f9", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "06fa83" },
        body: JSON.stringify({
          sessionId: "06fa83",
          location: "run-feed/route.ts:ingest_start",
          message: "ingest started",
          data: { feed_key: feedKey, ingest_name: currentIngest },
          hypothesisId: "H3",
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      result = await withTimeout(ingestStateDept(), "State Dept");
    } else if (feedKey === "reliefweb_disasters") {
      currentIngest = "ReliefWeb";
      // #region agent log
      fetch("http://127.0.0.1:7858/ingest/4ea7f127-3afa-4a64-b2bb-235c0c1420f9", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "06fa83" },
        body: JSON.stringify({
          sessionId: "06fa83",
          location: "run-feed/route.ts:ingest_start",
          message: "ingest started",
          data: { feed_key: feedKey, ingest_name: currentIngest },
          hypothesisId: "H3",
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      result = await withTimeout(ingestReliefWeb(), "ReliefWeb");
    } else if (feedKey === "gdelt_events") {
      currentIngest = "GDELT Daily";
      result = await withTimeout(ingestGDELTDaily(), "GDELT Daily");
    } else {
      currentIngest = "CrisisWatch";
      // #region agent log
      fetch("http://127.0.0.1:7858/ingest/4ea7f127-3afa-4a64-b2bb-235c0c1420f9", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "06fa83" },
        body: JSON.stringify({
          sessionId: "06fa83",
          location: "run-feed/route.ts:ingest_start",
          message: "ingest started",
          data: { feed_key: feedKey, ingest_name: currentIngest },
          hypothesisId: "H3",
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      result = await withTimeout(ingestCrisisWatch(), "CrisisWatch");
    }

    return NextResponse.json({
      fetched: result.fetched,
      processed: result.processed,
      skipped: result.skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const errorName = err instanceof Error ? err.constructor?.name ?? "Error" : "non-Error";
    const isTimeout = typeof message === "string" && message.includes("timed out");
    // #region agent log
    fetch("http://127.0.0.1:7858/ingest/4ea7f127-3afa-4a64-b2bb-235c0c1420f9", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "06fa83" },
      body: JSON.stringify({
        sessionId: "06fa83",
        location: "run-feed/route.ts:catch",
        message: "run-feed 500 path",
        data: {
          feed_key: feedKey,
          current_ingest: currentIngest,
          error_message: message,
          error_name: errorName,
          is_timeout: isTimeout,
        },
        hypothesisId: "H3,H4,H5",
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    console.error("[run-feed] feed ingest failed", { feed_key: feedKey, error: message });
    return internalError(message);
  }
}
