import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { createRequestLogger } from "@/lib/logger";
import { internalError } from "@/lib/apiError";

/**
 * GET /api/public/escalations
 * Returns open (unresolved) escalation alerts with event_ids and centroid for map.
 * Query param: region (optional) - filter by region_key.
 * No auth required.
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = createRequestLogger({ requestId });
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
