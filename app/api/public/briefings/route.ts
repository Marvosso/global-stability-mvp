import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { createRequestLogger } from "@/lib/logger";
import { badRequest, internalError } from "@/lib/apiError";
import { getRegionKey } from "@/lib/regionKey";

/**
 * GET /api/public/briefings
 * Returns approved AI briefings for events in a region.
 * Query param: region (required) - region_key (e.g. ISR or grid_31.5_34.5).
 * No auth required.
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = createRequestLogger({ requestId });
  const region = request.nextUrl.searchParams.get("region")?.trim();

  if (!region || region === "") {
    return badRequest("region query param is required");
  }

  const { data: briefings, error: briefError } = await supabaseAdmin
    .from("event_briefings")
    .select("event_id, brief_json, generated_at, version")
    .eq("status", "Approved");

  if (briefError) {
    log.error("Briefings query failed", { error: briefError.message });
    return internalError(briefError.message);
  }

  if (!briefings?.length) {
    return NextResponse.json([]);
  }

  const eventIds = [...new Set(briefings.map((b) => b.event_id))];
  const { data: events, error: eventsError } = await supabaseAdmin
    .from("events")
    .select("id, country_code, primary_location, title")
    .in("id", eventIds)
    .eq("status", "Published");

  if (eventsError) {
    log.error("Events query for briefings failed", { error: eventsError.message });
    return internalError(eventsError.message);
  }

  const eventsInRegion = (events ?? []).filter(
    (row: { id: string; country_code?: string | null; primary_location?: string | null }) => {
      const key = getRegionKey(row.country_code ?? null, row.primary_location ?? null);
      return key === region;
    }
  );
  const regionEventIds = new Set(eventsInRegion.map((e: { id: string }) => e.id));
  const titleByEventId = new Map(
    eventsInRegion.map((e: { id: string; title?: string | null }) => [e.id, e.title ?? "Untitled"])
  );

  const result = briefings
    .filter((b) => regionEventIds.has(b.event_id))
    .map((b) => ({
      event_id: b.event_id,
      event_title: titleByEventId.get(b.event_id) ?? "Untitled",
      brief_json: b.brief_json,
      generated_at: b.generated_at,
      version: b.version,
    }));

  log.info("Public briefings listed", { region, count: result.length });
  return NextResponse.json(result);
}
