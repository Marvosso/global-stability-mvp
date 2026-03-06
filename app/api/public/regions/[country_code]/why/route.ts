import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { createRequestLogger } from "@/lib/logger";
import { notFound, internalError } from "@/lib/apiError";

/** Severity order for importance: higher = more important */
const SEVERITY_ORDER: Record<string, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

function importanceRank(severity: string | null): number {
  return severity && SEVERITY_ORDER[severity] !== undefined ? SEVERITY_ORDER[severity] : 0;
}

/**
 * GET /api/public/regions/[country_code]/why
 * Returns region context: current score, delta_7d, top contributing categories from score_components,
 * top 3 recent events by importance, and a 1-paragraph template summary.
 * No auth. 404 if no score data for the country.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ country_code: string }> }
) {
  const requestId = crypto.randomUUID();
  const log = createRequestLogger({ requestId });
  const params = await context.params;
  const countryCode = params?.country_code?.trim()?.toUpperCase();

  if (!countryCode || countryCode.length < 2) {
    return notFound("Region not found");
  }
  if (countryCode === "GLOBAL") {
    return notFound("Use country code for region why");
  }

  const { data: scoreRow, error: scoreError } = await supabaseAdmin
    .from("region_scores")
    .select("id, stability_score, delta_7d, as_of_date")
    .eq("region_type", "country")
    .eq("region_code", countryCode)
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (scoreError) {
    log.error("Region score query failed", { error: scoreError.message, country_code: countryCode });
    return internalError(scoreError.message);
  }

  const stability_score = scoreRow?.stability_score != null ? Number(scoreRow.stability_score) : null;
  const delta_7d = scoreRow?.delta_7d != null ? Number(scoreRow.delta_7d) : null;
  const regionScoreId = scoreRow?.id ?? null;

  const contributing_categories: { component: string; value: number }[] = [];
  if (regionScoreId) {
    const { data: compRows, error: compError } = await supabaseAdmin
      .from("score_components")
      .select("component, value")
      .eq("region_score_id", regionScoreId)
      .order("value", { ascending: false });

    if (!compError && compRows?.length) {
      contributing_categories.push(
        ...compRows.map((r: { component: string; value: unknown }) => ({
          component: String(r.component),
          value: Number(r.value),
        }))
      );
    }
  }

  const { data: eventRows, error: eventsError } = await supabaseAdmin
    .from("events")
    .select("id, title, category, severity, occurred_at")
    .eq("status", "Published")
    .eq("country_code", countryCode)
    .order("occurred_at", { ascending: false })
    .limit(50);

  if (eventsError) {
    log.error("Region events query failed", { error: eventsError.message, country_code: countryCode });
    return internalError(eventsError.message);
  }

  const sorted = (eventRows ?? []).sort(
    (a: { severity?: string | null; occurred_at?: string | null }, b: { severity?: string | null; occurred_at?: string | null }) => {
      const impA = importanceRank(a.severity ?? null);
      const impB = importanceRank(b.severity ?? null);
      if (impB !== impA) return impB - impA;
      const at = (a.occurred_at ?? "") as string;
      const bt = (b.occurred_at ?? "") as string;
      return bt.localeCompare(at);
    }
  );
  const recent_events = sorted.slice(0, 3).map((e: { id: string; title: string | null; category?: string | null; severity?: string | null; occurred_at?: string | null }) => ({
    id: e.id,
    title: e.title ?? "Event",
    category: e.category ?? undefined,
    severity: e.severity ?? undefined,
    occurred_at: e.occurred_at ?? undefined,
  }));

  const deltaText =
    delta_7d != null
      ? delta_7d > 0
        ? `Stability improved by ${delta_7d.toFixed(1)} points over the past 7 days.`
        : delta_7d < 0
          ? `Stability decreased by ${Math.abs(delta_7d).toFixed(1)} points over the past 7 days.`
          : "Stability is unchanged over the past 7 days."
      : "No prior score available for comparison.";
  const scoreText =
    stability_score != null
      ? `${countryCode} has a current stability score of ${stability_score.toFixed(1)} out of 100. `
      : "";
  const categoryText =
    contributing_categories.length > 0
      ? `Contributing factors include: ${contributing_categories.map((c) => `${c.component} (${c.value})`).join(", ")}. `
      : "";
  const eventsText =
    recent_events.length > 0
      ? `Recent high-impact events: ${recent_events.map((e) => e.title).join("; ")}.`
      : "No recent published events in this region.";
  const region_summary = [scoreText, deltaText, categoryText, eventsText].filter(Boolean).join(" ");

  const body = {
    stability_score,
    delta_7d,
    contributing_categories: contributing_categories,
    recent_events,
    region_summary,
  };

  if (stability_score == null && recent_events.length === 0) {
    return notFound("No data for this region");
  }

  log.info("Region why returned", { country_code: countryCode });
  return NextResponse.json(body);
}
