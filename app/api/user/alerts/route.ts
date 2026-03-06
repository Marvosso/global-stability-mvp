import { supabaseAdmin } from "@/app/api/_lib/db";
import { requirePremium } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import { responseFromThrown, unauthorized, internalError } from "@/lib/apiError";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/user/alerts
 * Returns user_alerts for the logged-in user (newest first), enriched with event details.
 */
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

  const { data: userAlerts, error } = await supabaseAdmin
    .from("user_alerts")
    .select("id, user_id, event_id, alert_type, created_at, seen")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false });

  if (error) {
    log.error("User alerts query failed", { error: error.message });
    return internalError(error.message);
  }

  const list = userAlerts ?? [];
  if (list.length === 0) {
    return NextResponse.json([]);
  }

  const eventIds = [...new Set(list.map((a) => a.event_id))];
  const { data: events } = await supabaseAdmin
    .from("events")
    .select("id, title, country_code, severity, category, occurred_at")
    .in("id", eventIds);
  const eventMap = new Map((events ?? []).map((e) => [e.id, e]));

  const enriched = list.map((a) => {
    const ev = eventMap.get(a.event_id);
    return {
      id: a.id,
      user_id: a.user_id,
      event_id: a.event_id,
      alert_type: a.alert_type,
      created_at: a.created_at,
      seen: a.seen,
      event_title: ev?.title ?? null,
      event_country_code: ev?.country_code ?? null,
      event_severity: ev?.severity ?? null,
      event_category: ev?.category ?? null,
      event_occurred_at: ev?.occurred_at ?? null,
    };
  });

  return NextResponse.json(enriched);
}
