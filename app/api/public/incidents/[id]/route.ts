import { supabaseAdmin } from "../../../_lib/db";
import { createRequestLogger } from "@/lib/logger";
import { notFound, internalError } from "@/lib/apiError";
import { uuidSchema } from "@/app/api/_lib/validation";
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_EVENT_COLUMNS =
  "id,title,summary,details,category,subtype,primary_classification,secondary_classification,severity,confidence_level,occurred_at,ended_at,primary_location,created_at,updated_at,context_background,key_parties,competing_claims,country_code";

type IncidentRow = {
  id: string;
  title: string | null;
  category: string | null;
  subtype: string | null;
  severity: string | null;
  confidence_level: string | null;
  primary_location: unknown;
  country_code: string | null;
  occurred_at: string | null;
  created_at: string;
  updated_at: string;
};

function incidentPrimaryLocationToText(loc: unknown): string | null {
  if (loc == null) return null;
  if (typeof loc === "string") return loc;
  if (typeof loc === "object" && loc !== null && "coordinates" in loc) {
    const coords = (loc as { coordinates?: [number, number] }).coordinates;
    if (Array.isArray(coords) && coords.length >= 2) return `${coords[1]},${coords[0]}`;
  }
  return null;
}

/**
 * GET /api/public/incidents/[id]
 * Returns incident and its published events (source reports). 404 if incident not found.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const params = await context.params;
  const idResult = uuidSchema.safeParse(params?.id);
  if (!idResult.success) {
    return notFound("Incident not found");
  }
  const id = idResult.data;
  const log = createRequestLogger({ requestId });

  const { data: incident, error: incidentErr } = await supabaseAdmin
    .from("incidents")
    .select("id,title,category,subtype,severity,confidence_level,primary_location,country_code,occurred_at,created_at,updated_at")
    .eq("id", id)
    .maybeSingle();

  if (incidentErr) {
    log.error("Public incident by id failed", { error: incidentErr.message, incidentId: id });
    return internalError(incidentErr.message);
  }
  if (!incident) {
    return notFound("Incident not found");
  }

  const { data: events, error: eventsErr } = await supabaseAdmin
    .from("events")
    .select(PUBLIC_EVENT_COLUMNS)
    .eq("incident_id", id)
    .eq("status", "Published")
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: true });

  if (eventsErr) {
    log.error("Public incident events failed", { error: eventsErr.message, incidentId: id });
    return internalError(eventsErr.message);
  }

  const row = incident as IncidentRow;
  const incidentPayload = {
    id: row.id,
    title: row.title,
    category: row.category,
    subtype: row.subtype,
    severity: row.severity,
    confidence_level: row.confidence_level,
    primary_location: incidentPrimaryLocationToText(row.primary_location),
    country_code: row.country_code,
    occurred_at: row.occurred_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  return NextResponse.json({
    incident: incidentPayload,
    events: events ?? [],
  });
}
