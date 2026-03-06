import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { createRequestLogger } from "@/lib/logger";
import { internalError, responseFromThrown } from "@/lib/apiError";
import { requireApiKey } from "@/lib/apiKey";

/**
 * GET /api/v1/escalation
 * Enterprise API: same as public escalations (unresolved escalation alerts), requires API key.
 * Query param: region (optional) - filter by region_key.
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = createRequestLogger({ requestId });

  try {
    await requireApiKey(request);
  } catch (e) {
    const res = responseFromThrown(e);
    if (res) return res;
    throw e;
  }

  const region = request.nextUrl.searchParams.get("region")?.trim() ?? null;

  let query = supabaseAdmin
    .from("escalation_alerts")
    .select(
      "id, region_key, category, severity, event_count, window_hours, created_at, event_ids, centroid_lng, centroid_lat"
    )
    .is("resolved_at", null)
    .order("created_at", { ascending: false });

  if (region != null && region !== "") {
    query = query.eq("region_key", region);
  }

  const { data, error } = await query;

  if (error) {
    log.error("Escalations query failed", { error: error.message });
    return internalError(error.message);
  }

  const list = data ?? [];
  return NextResponse.json(list);
}
