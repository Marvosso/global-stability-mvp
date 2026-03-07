import { supabaseAdmin } from "@/app/api/_lib/db";
import { requirePremium, requireReviewer } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import { responseFromThrown, unauthorized, internalError } from "@/lib/apiError";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/alerts
 * Returns alerts for the logged-in user (newest first).
 * Accepts premium/enterprise users OR admin/reviewer users.
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();

  let ctx: { userId: string };
  try {
    ctx = await requirePremium(request);
  } catch (premiumErr) {
    // Admin and Reviewer users can also access their own alerts
    try {
      ctx = await requireReviewer(request);
    } catch {
      const res = responseFromThrown(premiumErr);
      if (res) return res;
      return unauthorized();
    }
  }

  const log = createRequestLogger({ requestId });

  const { data: alerts, error } = await supabaseAdmin
    .from("alerts")
    .select("id, event_id, watchlist_id, created_at, read_at")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false });

  if (error) {
    log.error("Alerts query failed", { error: error.message });
    return internalError(error.message);
  }

  const list = alerts ?? [];
  if (list.length === 0) {
    return NextResponse.json([]);
  }

  const eventIds = [...new Set(list.map((a) => a.event_id))];
  const watchlistIds = [...new Set(list.map((a) => a.watchlist_id))];

  const { data: events } = await supabaseAdmin
    .from("events")
    .select("id, title")
    .in("id", eventIds);
  const eventMap = new Map(
    (events ?? []).map((e) => [e.id, e.title ?? "Event"])
  );

  const { data: watchlists } = await supabaseAdmin
    .from("user_watchlists")
    .select("id, watch_type, watch_value")
    .in("id", watchlistIds);
  const watchlistMap = new Map(
    (watchlists ?? []).map((w) => [
      w.id,
      { watch_type: w.watch_type, watch_value: w.watch_value, watchlist_label: `${w.watch_type}: ${w.watch_value}` },
    ])
  );

  const enriched = list.map((a) => {
    const w = watchlistMap.get(a.watchlist_id);
    return {
      id: a.id,
      event_id: a.event_id,
      watchlist_id: a.watchlist_id,
      created_at: a.created_at,
      read_at: a.read_at,
      event_title: eventMap.get(a.event_id) ?? "Event",
      watch_type: w?.watch_type ?? null,
      watch_value: w?.watch_value ?? null,
      watchlist_label: w?.watchlist_label ?? null,
    };
  });

  return NextResponse.json(enriched);
}
