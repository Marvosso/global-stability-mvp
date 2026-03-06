/**
 * GET /api/user/export
 * API export: returns the user's alerts and watchlists (and optionally dashboards list).
 * Premium/enterprise only (Phase 15D).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { requirePremium } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import { responseFromThrown, unauthorized, internalError } from "@/lib/apiError";

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();

  let ctx;
  try {
    ctx = await requirePremium(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    return unauthorized();
  }

  const log = createRequestLogger({ requestId });

  const [alertsRes, watchlistsRes, dashboardsRes] = await Promise.all([
    supabaseAdmin
      .from("alerts")
      .select("id, event_id, watchlist_id, created_at, read_at")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("user_watchlists")
      .select("id, watch_type, watch_value, email_notifications, created_at")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("user_dashboards")
      .select("id, name, filters, created_at")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false }),
  ]);

  if (alertsRes.error) {
    log.error("Export alerts query failed", { error: alertsRes.error.message });
    return internalError(alertsRes.error.message);
  }
  if (watchlistsRes.error) {
    log.error("Export watchlists query failed", { error: watchlistsRes.error.message });
    return internalError(watchlistsRes.error.message);
  }
  if (dashboardsRes.error) {
    log.error("Export dashboards query failed", { error: dashboardsRes.error.message });
    return internalError(dashboardsRes.error.message);
  }

  const user_alertsRes = await supabaseAdmin
    .from("user_alerts")
    .select("id, event_id, alert_type, created_at, seen")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false });

  const payload = {
    exported_at: new Date().toISOString(),
    alerts: alertsRes.data ?? [],
    user_alerts: user_alertsRes.data ?? [],
    watchlists: watchlistsRes.data ?? [],
    dashboards: dashboardsRes.data ?? [],
  };

  log.info("API export completed", { userId: ctx.userId });
  return NextResponse.json(payload);
}
