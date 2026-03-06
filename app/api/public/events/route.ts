import { supabaseAdmin } from "../../_lib/db";
import { publicEventsQuerySchema } from "../../_lib/validation";
import { createRequestLogger } from "../../../../lib/logger";
import { badRequest, internalError } from "../../../../lib/apiError";
import { getRegionKey } from "../../../../lib/regionKey";
import type { PublicMapItem } from "@/lib/eventCoordinates";
import { NextRequest, NextResponse } from "next/server";

/** Geography from Supabase is returned as GeoJSON: { type: "Point", coordinates: [lng, lat] }. */
function geoJsonToLatLng(geo: unknown): string | null {
  if (!geo || typeof geo !== "object") return null;
  const g = geo as { type?: string; coordinates?: [number, number] };
  if (g.type !== "Point" || !Array.isArray(g.coordinates) || g.coordinates.length < 2) return null;
  const [lng, lat] = g.coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `${lat},${lng}`;
}

/** Fallback when get_public_map_items RPC is missing (migration not run). Queries incidents + events directly. */
async function fetchMapItemsFallback(
  limit: number,
  offset: number
): Promise<PublicMapItem[] | null> {
  try {
    const { data: incidentIds } = await supabaseAdmin
      .from("events")
      .select("incident_id")
      .eq("status", "Published")
      .not("incident_id", "is", null);
    const ids = [...new Set((incidentIds ?? []).map((r) => r.incident_id).filter(Boolean))] as string[];
    if (ids.length === 0) {
      const { data: standalone } = await supabaseAdmin
        .from("events")
        .select("id, title, category, subtype, severity, confidence_level, primary_location, occurred_at, country_code")
        .is("incident_id", null)
        .eq("status", "Published")
        .order("occurred_at", { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);
      return (standalone ?? []).map((e) => ({
        id: e.id,
        incident_id: null,
        title: e.title,
        category: e.category,
        subtype: e.subtype,
        severity: e.severity,
        confidence_level: e.confidence_level,
        primary_location: e.primary_location,
        occurred_at: e.occurred_at,
        source_count: 1,
        country_code: e.country_code,
      }));
    }
    const { data: incidents, error: incErr } = await supabaseAdmin
      .from("incidents")
      .select("id, title, category, subtype, severity, confidence_level, primary_location, occurred_at, country_code")
      .in("id", ids);
    if (incErr || !incidents?.length) {
      const { data: standalone } = await supabaseAdmin
        .from("events")
        .select("id, title, category, subtype, severity, confidence_level, primary_location, occurred_at, country_code")
        .is("incident_id", null)
        .eq("status", "Published")
        .order("occurred_at", { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);
      return (standalone ?? []).map((e) => ({
        id: e.id,
        incident_id: null,
        title: e.title,
        category: e.category,
        subtype: e.subtype,
        severity: e.severity,
        confidence_level: e.confidence_level,
        primary_location: e.primary_location,
        occurred_at: e.occurred_at,
        source_count: 1,
        country_code: e.country_code,
      }));
    }
    const { data: counts } = await supabaseAdmin
      .from("events")
      .select("incident_id")
      .eq("status", "Published")
      .in("incident_id", ids);
    const countMap = new Map<string, number>();
    for (const r of counts ?? []) {
      if (r.incident_id) countMap.set(r.incident_id, (countMap.get(r.incident_id) ?? 0) + 1);
    }
    const { data: standalone } = await supabaseAdmin
      .from("events")
      .select("id, title, category, subtype, severity, confidence_level, primary_location, occurred_at, country_code")
      .is("incident_id", null)
      .eq("status", "Published")
      .order("occurred_at", { ascending: false, nullsFirst: false });
    const incidentItems: PublicMapItem[] = incidents.map((i) => ({
      id: i.id,
      incident_id: i.id,
      title: i.title,
      category: i.category,
      subtype: i.subtype,
      severity: i.severity,
      confidence_level: i.confidence_level,
      primary_location: geoJsonToLatLng(i.primary_location) ?? (i.primary_location as string | null),
      occurred_at: i.occurred_at,
      source_count: countMap.get(i.id) ?? 0,
      country_code: i.country_code,
    }));
    const standaloneItems: PublicMapItem[] = (standalone ?? []).map((e) => ({
      id: e.id,
      incident_id: null,
      title: e.title,
      category: e.category,
      subtype: e.subtype,
      severity: e.severity,
      confidence_level: e.confidence_level,
      primary_location: e.primary_location,
      occurred_at: e.occurred_at,
      source_count: 1,
      country_code: e.country_code,
    }));
    const merged = [...incidentItems, ...standaloneItems].sort((a, b) => {
      const ta = a.occurred_at ? new Date(a.occurred_at).getTime() : 0;
      const tb = b.occurred_at ? new Date(b.occurred_at).getTime() : 0;
      return tb - ta;
    });
    return merged.slice(offset, offset + limit);
  } catch {
    return null;
  }
}

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
  // #region agent log
  fetch("http://127.0.0.1:7858/ingest/4ea7f127-3afa-4a64-b2bb-235c0c1420f9", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "06fa83" },
    body: JSON.stringify({
      sessionId: "06fa83",
      location: "app/api/public/events/route.ts:preRPC",
      message: "About to call get_public_map_items",
      data: { fetchLimit, fetchOffset, tier, region },
      timestamp: Date.now(),
      hypothesisId: "B",
    }),
  }).catch(() => {});
  // #endregion
  const { data, error } = await supabaseAdmin.rpc("get_public_map_items", {
    p_limit: fetchLimit,
    p_offset: fetchOffset,
  });

  if (error) {
    // #region agent log
    fetch("http://127.0.0.1:7858/ingest/4ea7f127-3afa-4a64-b2bb-235c0c1420f9", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "06fa83" },
      body: JSON.stringify({
        sessionId: "06fa83",
        location: "app/api/public/events/route.ts:RPC",
        message: "get_public_map_items RPC failed",
        data: {
          errorMessage: error.message,
          errorCode: error.code,
          errorDetails: error.details,
          errorHint: error.hint,
          params: { p_limit: fetchLimit, p_offset: fetchOffset },
        },
        timestamp: Date.now(),
        hypothesisId: "A",
      }),
    }).catch(() => {});
    // #endregion
    if (error.code === "PGRST202") {
      const fallback = await fetchMapItemsFallback(fetchLimit, fetchOffset);
      if (fallback) {
        let list = fallback;
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
        log.info("Public map items listed (fallback)", { count: list.length });
        return NextResponse.json(list);
      }
    }
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
