import { supabaseAdmin } from "../../_lib/db";
import { publicEventsQuerySchema } from "../../_lib/validation";
import { createRequestLogger } from "../../../../lib/logger";
import { badRequest, internalError } from "../../../../lib/apiError";
import { getRegionKey } from "../../../../lib/regionKey";
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_EVENT_COLUMNS =
  "id,title,summary,details,category,subtype,primary_classification,secondary_classification,severity,confidence_level,occurred_at,ended_at,primary_location,created_at,updated_at,context_background,key_parties,competing_claims,country_code";

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const parseResult = publicEventsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parseResult.success) {
    const log = createRequestLogger({ requestId });
    const msg = parseResult.error.errors.map((e) => e.message).join("; ") || "Invalid query";
    log.warn("Invalid query", { message: msg });
    return badRequest(msg);
  }
  const { tier, region, limit, offset } = parseResult.data;
  const log = createRequestLogger({ requestId });

  let eventIds: string[] | null = null;
  if (tier != null) {
    const { data: sources } = await supabaseAdmin
      .from("sources")
      .select("id")
      .eq("reliability_tier", tier);
    const sourceIds = (sources ?? []).map((s) => s.id);
    if (sourceIds.length === 0) {
      return NextResponse.json([]);
    }
    const { data: links } = await supabaseAdmin
      .from("event_sources")
      .select("event_id")
      .in("source_id", sourceIds);
    const ids = [...new Set((links ?? []).map((l) => l.event_id))];
    if (ids.length === 0) {
      return NextResponse.json([]);
    }
    eventIds = ids;
  }

  let query = supabaseAdmin
    .from("events")
    .select(PUBLIC_EVENT_COLUMNS)
    .eq("status", "Published")
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });

  if (eventIds != null) {
    query = query.in("id", eventIds);
  }

  const fetchLimit = region != null && region.trim() !== "" ? 500 : limit;
  const fetchOffset = region != null && region.trim() !== "" ? 0 : offset;
  const { data, error } = await query.range(fetchOffset, fetchOffset + fetchLimit - 1);

  if (error) {
    log.error("Public events query failed", { error: error.message });
    return internalError(error.message);
  }

  let list = data ?? [];
  if (region != null && region.trim() !== "") {
    const r = region.trim();
    list = list.filter((row: { country_code?: string | null; primary_location?: string | null }) => {
      const key = getRegionKey(row.country_code ?? null, row.primary_location ?? null);
      return key === r;
    });
    list = list.slice(offset, offset + limit);
  }

  log.info("Public events listed", { count: list.length, limit, offset, region: region ?? undefined });
  return NextResponse.json(list);
}
