import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { createRequestLogger } from "@/lib/logger";
import { badRequest, internalError } from "@/lib/apiError";

/**
 * GET /api/public/scores
 * Returns latest stability scores for a region type (e.g. country).
 * Query param: region_type (required) - e.g. "country".
 * No auth required.
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = createRequestLogger({ requestId });
  const regionType = request.nextUrl.searchParams.get("region_type")?.trim();

  if (!regionType || regionType === "") {
    return badRequest("region_type query param is required");
  }

  if (regionType !== "country") {
    return badRequest("region_type must be 'country'");
  }

  const { data: latestRow, error: latestError } = await supabaseAdmin
    .from("region_scores")
    .select("as_of_date")
    .eq("region_type", regionType)
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    log.error("Latest score date query failed", { error: latestError.message });
    return internalError(latestError.message);
  }

  if (!latestRow?.as_of_date) {
    return NextResponse.json([]);
  }

  const latestDate = String(latestRow.as_of_date);
  const { data: scores, error: scoresError } = await supabaseAdmin
    .from("region_scores")
    .select("id, region_type, region_code, as_of_date, stability_score, delta_24h, delta_7d, computed_at")
    .eq("region_type", regionType)
    .eq("as_of_date", latestDate)
    .order("region_code", { ascending: true });

  if (scoresError) {
    log.error("Scores query failed", { error: scoresError.message });
    return internalError(scoresError.message);
  }

  log.info("Public scores listed", { region_type: regionType, count: scores?.length ?? 0 });
  return NextResponse.json(scores ?? []);
}
