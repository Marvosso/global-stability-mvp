import { supabaseAdmin } from "../../_lib/db";
import { publicEventsQuerySchema } from "../../_lib/validation";
import { createRequestLogger } from "../../../../lib/logger";
import { badRequest, internalError } from "../../../../lib/apiError";
import { getRegionKey } from "../../../../lib/regionKey";
import type { PublicMapItem } from "@/lib/eventCoordinates";
import { NextRequest, NextResponse } from "next/server";

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

  let tierEventIds: Set<string> | null = null;
  let tierIncidentIds: Set<string> | null = null;
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
    tierEventIds = new Set(ids);
    const { data: eventRows } = await supabaseAdmin
      .from("events")
      .select("incident_id")
      .in("id", ids)
      .not("incident_id", "is", null);
    tierIncidentIds = new Set(
      (eventRows ?? []).map((r) => r.incident_id).filter((x): x is string => x != null)
    );
  }

  const fetchLimit = region != null && region.trim() !== "" ? 500 : limit;
  const fetchOffset = region != null && region.trim() !== "" ? 0 : offset;
  const { data, error } = await supabaseAdmin.rpc("get_public_map_items", {
    p_limit: fetchLimit,
    p_offset: fetchOffset,
  });

  if (error) {
    log.error("Public map items query failed", { error: error.message });
    return internalError(error.message);
  }

  let list = (data ?? []) as PublicMapItem[];

  if (tierEventIds != null && tierIncidentIds != null) {
    list = list.filter((row) => {
      if (row.incident_id != null) return tierIncidentIds!.has(row.incident_id);
      return tierEventIds!.has(row.id);
    });
  }

  if (region != null && region.trim() !== "") {
    const r = region.trim();
    list = list.filter((row) => {
      const key = getRegionKey(row.country_code ?? null, row.primary_location ?? null);
      return key === r;
    });
    list = list.slice(offset, offset + limit);
  }

  log.info("Public map items listed", {
    count: list.length,
    limit,
    offset,
    region: region ?? undefined,
  });
  return NextResponse.json(list);
}
