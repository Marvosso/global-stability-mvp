import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { createRequestLogger } from "@/lib/logger";
import { internalError } from "@/lib/apiError";

/**
 * GET /api/public/heatmap
 * Returns country-level stability scores for map shading.
 * Response: { country_code, stability_score, delta_24h }[] (excludes global).
 * No auth required.
 */
export async function GET(_request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = createRequestLogger({ requestId });

  const { data: latestRow, error: latestError } = await supabaseAdmin
    .from("region_scores")
    .select("as_of_date")
    .eq("region_type", "country")
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    log.error("Heatmap latest date query failed", { error: latestError.message });
    return internalError(latestError.message);
  }

  if (!latestRow?.as_of_date) {
    return NextResponse.json([]);
  }

  const latestDate = String(latestRow.as_of_date);
  const { data: rows, error: scoresError } = await supabaseAdmin
    .from("region_scores")
    .select("region_code, stability_score, delta_24h")
    .eq("region_type", "country")
    .eq("as_of_date", latestDate)
    .neq("region_code", "global")
    .order("region_code", { ascending: true });

  if (scoresError) {
    log.error("Heatmap scores query failed", { error: scoresError.message });
    return internalError(scoresError.message);
  }

  const heatmap = (rows ?? []).map((r: { region_code: string; stability_score: number; delta_24h: number | null }) => ({
    country_code: r.region_code,
    stability_score: Number(r.stability_score),
    delta_24h: r.delta_24h != null ? Number(r.delta_24h) : null,
  }));

  log.info("Public heatmap listed", { count: heatmap.length });
  return NextResponse.json(heatmap);
}
