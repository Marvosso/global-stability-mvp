/**
 * GET /api/user/dashboards/[id]/query
 * Runs the dashboard query: returns events, stability_scores, and escalation_signals
 * using the dashboard's filters (region, limit, offset, tier).
 */

import { NextRequest, NextResponse } from "next/server";
import { uuidSchema, dashboardFiltersSchema } from "@/app/api/_lib/validation";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { requirePremium } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import { getRegionKey } from "@/lib/regionKey";
import {
  badRequest,
  notFound,
  responseFromThrown,
  unauthorized,
  internalError,
} from "@/lib/apiError";

const PUBLIC_EVENT_COLUMNS =
  "id,title,summary,details,category,subtype,primary_classification,secondary_classification,severity,confidence_level,occurred_at,ended_at,primary_location,created_at,updated_at,context_background,key_parties,competing_claims,country_code";

async function getDashboardOr404(
  id: string,
  userId: string,
  log: ReturnType<typeof createRequestLogger>
) {
  const { data, error } = await supabaseAdmin
    .from("user_dashboards")
    .select("id, name, filters")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    log.error("Dashboard fetch failed", { error: error.message, dashboardId: id });
    return { row: null, error: internalError(error.message) };
  }
  if (!data) {
    log.warn("Dashboard not found", { dashboardId: id });
    return { row: null, error: notFound("Dashboard not found") };
  }
  return { row: data, error: null };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const params = await context.params;
  const idResult = uuidSchema.safeParse(params?.id);
  if (!idResult.success) {
    return badRequest("Invalid dashboard id");
  }
  const id = idResult.data;

  let ctx;
  try {
    ctx = await requirePremium(_request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    return unauthorized();
  }

  const log = createRequestLogger({ requestId });
  const { row: dashboard, error: fetchErr } = await getDashboardOr404(id, ctx.userId, log);
  if (fetchErr) return fetchErr;

  const filters = dashboard!.filters as Record<string, unknown> | null;
  const parsed = dashboardFiltersSchema.safeParse({
    region: filters?.region,
    limit: filters?.limit,
    offset: filters?.offset,
    tier: filters?.tier,
  });
  const resolved = parsed.success ? parsed.data : {};
  const region = resolved.region;
  const limit = resolved.limit ?? 20;
  const offset = resolved.offset ?? 0;
  const tier = resolved.tier;

  // 1. Events (same logic as GET /api/public/events)
  let eventIds: string[] | null = null;
  if (tier != null) {
    const { data: sources } = await supabaseAdmin
      .from("sources")
      .select("id")
      .eq("reliability_tier", tier);
    const sourceIds = (sources ?? []).map((s) => s.id);
    if (sourceIds.length > 0) {
      const { data: links } = await supabaseAdmin
        .from("event_sources")
        .select("event_id")
        .in("source_id", sourceIds);
      eventIds = [...new Set((links ?? []).map((l) => l.event_id))];
    } else {
      eventIds = [];
    }
  }

  let eventsQuery = supabaseAdmin
    .from("events")
    .select(PUBLIC_EVENT_COLUMNS)
    .eq("status", "Published")
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });

  if (eventIds !== null) {
    if (eventIds.length === 0) {
      eventsQuery = eventsQuery.eq("id", "00000000-0000-0000-0000-000000000000"); // no match
    } else {
      eventsQuery = eventsQuery.in("id", eventIds);
    }
  }

  const fetchLimit = region != null && region.trim() !== "" ? 500 : limit;
  const fetchOffset = region != null && region.trim() !== "" ? 0 : offset;
  const { data: eventsRaw, error: eventsError } = await eventsQuery.range(fetchOffset, fetchOffset + fetchLimit - 1);

  if (eventsError) {
    log.error("Dashboard events query failed", { error: eventsError.message });
    return internalError(eventsError.message);
  }

  let events = eventsRaw ?? [];
  if (region != null && region.trim() !== "") {
    const r = region.trim();
    events = events.filter((row: { country_code?: string | null; primary_location?: string | null }) => {
      const key = getRegionKey(row.country_code ?? null, row.primary_location ?? null);
      return key === r;
    });
    events = events.slice(offset, offset + limit);
  }

  // 2. Stability scores (latest country-level; optional region filter)
  const { data: latestRow } = await supabaseAdmin
    .from("region_scores")
    .select("as_of_date")
    .eq("region_type", "country")
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  let stability_scores: Array<Record<string, unknown>> = [];
  if (latestRow?.as_of_date) {
    let scoresQuery = supabaseAdmin
      .from("region_scores")
      .select("id, region_type, region_code, as_of_date, stability_score, delta_24h, delta_7d, computed_at")
      .eq("region_type", "country")
      .eq("as_of_date", String(latestRow.as_of_date))
      .order("region_code", { ascending: true });

    if (region != null && region.trim() !== "") {
      scoresQuery = scoresQuery.eq("region_code", region.trim());
    }
    const { data: scores, error: scoresError } = await scoresQuery;
    if (!scoresError) {
      stability_scores = (scores ?? []).map((s) => ({ ...s }));
    }
  }

  // 3. Escalation signals: escalation_indicators (recent) + region_risk_scores
  const indicatorsQuery = supabaseAdmin
    .from("escalation_indicators")
    .select("id, region_code, indicator_type, score, description, detected_at")
    .gte("detected_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
    .order("detected_at", { ascending: false })
    .limit(200);

  if (region != null && region.trim() !== "") {
    indicatorsQuery.eq("region_code", region.trim());
  }
  const { data: indicators, error: indicatorsError } = await indicatorsQuery;

  const escalation_indicators = indicatorsError ? [] : (indicators ?? []);

  let riskQuery = supabaseAdmin
    .from("region_risk_scores")
    .select("region_code, risk_score, risk_level")
    .order("region_code", { ascending: true });

  if (region != null && region.trim() !== "") {
    riskQuery = riskQuery.eq("region_code", region.trim());
  }
  const { data: riskRows, error: riskError } = await riskQuery;
  const escalation_risk = riskError ? [] : (riskRows ?? []);

  const escalation_signals = {
    indicators: escalation_indicators,
    risk_by_region: escalation_risk,
  };

  log.info("Dashboard query executed", {
    dashboardId: id,
    eventsCount: events.length,
    scoresCount: stability_scores.length,
    indicatorsCount: escalation_indicators.length,
  });

  return NextResponse.json({
    events,
    stability_scores,
    escalation_signals,
  });
}
