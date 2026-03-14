/**
 * GET /api/internal/review/dashboard
 * Returns UnderReview events with feed_key, source_url (first linked source), location, summary.
 * Auth: Admin and Reviewer only.
 */

import { supabaseAdmin } from "../../../_lib/db";
import { requireReviewer } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import { responseFromThrown, internalError } from "@/lib/apiError";
import { NextRequest, NextResponse } from "next/server";

const LIMIT = 500;

type EventRow = {
  id: string;
  feed_key: string | null;
  title: string | null;
  summary: string | null;
  occurred_at: string | null;
  primary_location: string | null;
  category: string;
  subtype: string | null;
  severity: string;
  confidence_level: string;
  created_at: string;
};

type EventSourceRow = {
  event_id: string;
  sources: { url: string | null } | null;
} | {
  event_id: string;
  sources: Array<{ url: string | null }> | null;
};

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  let ctx: { userId: string; role: "Admin" | "Reviewer" } | undefined;
  try {
    ctx = await requireReviewer(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    throw err;
  }

  const log = createRequestLogger({ requestId, role: ctx.role });

  const { data: events, error: eventsError } = await supabaseAdmin
    .from("events")
    .select("id, feed_key, title, summary, occurred_at, primary_location, category, subtype, severity, confidence_level, created_at")
    .eq("status", "UnderReview")
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (eventsError) {
    log.error("Review dashboard events query failed", { error: eventsError.message });
    return internalError(eventsError.message);
  }

  const list = (events ?? []) as EventRow[];
  if (list.length === 0) {
    return NextResponse.json(list);
  }

  const eventIds = list.map((e) => e.id);
  const { data: links, error: linksError } = await supabaseAdmin
    .from("event_sources")
    .select("event_id, sources(url)")
    .in("event_id", eventIds);

  if (linksError) {
    log.warn("Review dashboard event_sources query failed", { error: linksError.message });
    // Continue without source_url
  }

  const firstUrlByEvent = new Map<string, string>();
  for (const row of (links ?? []) as EventSourceRow[]) {
    const url = Array.isArray(row.sources) ? row.sources[0]?.url : row.sources?.url;
    if (row.event_id && url && !firstUrlByEvent.has(row.event_id)) {
      firstUrlByEvent.set(row.event_id, url);
    }
  }

  const items = list.map((e) => ({
    id: e.id,
    feed_key: e.feed_key ?? null,
    title: e.title ?? null,
    source_url: firstUrlByEvent.get(e.id) ?? null,
    occurred_at: e.occurred_at ?? null,
    location: e.primary_location ?? null,
    summary: e.summary ?? null,
    category: e.category,
    subtype: e.subtype ?? null,
    severity: e.severity,
    confidence_level: e.confidence_level,
    created_at: e.created_at,
  }));

  log.info("Review dashboard listed", { count: items.length });
  return NextResponse.json(items);
}
