import { uuidSchema, eventContextUpdateSchema } from "../../../_lib/validation";
import { supabaseAdmin } from "../../../_lib/db";
import { requireReviewer } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import { updateSequenceStatsForEvent } from "@/lib/scenarios/updateSequenceStats";
import {
  badRequest,
  notFound,
  internalError,
  responseFromThrown,
  statusFromSupabaseError,
  errorResponse,
} from "@/lib/apiError";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = crypto.randomUUID();
  const idResult = uuidSchema.safeParse(params?.id);
  if (!idResult.success) {
    return badRequest("Invalid event id");
  }
  const id = idResult.data;

  let ctx;
  try {
    ctx = await requireReviewer(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    throw err;
  }

  const log = createRequestLogger({ requestId, role: ctx.role });

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("*")
    .eq("id", id)
    .single();

  if (eventError || !event) {
    log.warn("Event not found", { eventId: id });
    return notFound("Event not found");
  }

  const { data: actorsData, error: actorsError } = await supabaseAdmin
    .from("event_actors")
    .select(
      "actor_id, role, is_primary, notes, actors(id, name, actor_type, alignment, affiliation_label, country_code, notes)"
    )
    .eq("event_id", id);

  if (actorsError) {
    log.error("Event actors query failed", { error: actorsError.message, eventId: id });
    return internalError(actorsError.message);
  }

  const { data: sourcesData, error: sourcesError } = await supabaseAdmin
    .from("event_sources")
    .select(
      "source_id, claim_url, claim_timestamp, source_primary_classification, source_secondary_classification, source_confidence_level, raw_excerpt, sources(id, name, source_type, url, reliability_tier)"
    )
    .eq("event_id", id);

  if (sourcesError) {
    log.error("Event sources query failed", { error: sourcesError.message, eventId: id });
    return internalError(sourcesError.message);
  }

  const actors = (actorsData ?? []).map((row: Record<string, unknown>) => ({
    actor_id: row.actor_id,
    role: row.role,
    is_primary: row.is_primary ?? false,
    notes: row.notes ?? null,
    actor: row.actors ?? null,
  }));

  const sources = (sourcesData ?? []).map((row: Record<string, unknown>) => ({
    source_id: row.source_id,
    claim_url: row.claim_url ?? null,
    claim_timestamp: row.claim_timestamp ?? null,
    source_primary_classification: row.source_primary_classification ?? null,
    source_secondary_classification: row.source_secondary_classification ?? null,
    source_confidence_level: row.source_confidence_level ?? null,
    raw_excerpt: row.raw_excerpt ?? null,
    source: row.sources ?? null,
  }));

  const payload = {
    ...event,
    actors,
    sources,
  };

  log.info("Event fetched", { eventId: id });
  return NextResponse.json(payload);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = crypto.randomUUID();
  const idResult = uuidSchema.safeParse(params?.id);
  if (!idResult.success) {
    return badRequest("Invalid event id");
  }
  const id = idResult.data;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const log = createRequestLogger({ requestId });
    log.warn("Invalid JSON");
    return badRequest("Invalid JSON");
  }

  const parsed = eventContextUpdateSchema.safeParse(body);
  if (!parsed.success) {
    const log = createRequestLogger({ requestId });
    log.warn("Validation failed", { path: "body" });
    return badRequest("Validation failed", parsed.error.flatten());
  }

  const data = parsed.data;
  const updateRow: Record<string, unknown> = {};
  if (data.context_background !== undefined) updateRow.context_background = data.context_background;
  if (data.key_parties !== undefined) updateRow.key_parties = data.key_parties;
  if (data.competing_claims !== undefined) updateRow.competing_claims = data.competing_claims;
  if (data.outcome !== undefined) updateRow.outcome = data.outcome;

  if (Object.keys(updateRow).length === 0) {
    return badRequest("No fields to update");
  }

  let ctx;
  try {
    ctx = await requireReviewer(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    throw err;
  }

  const log = createRequestLogger({ requestId, role: ctx.role });

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("events")
    .select("id, outcome")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existing) {
    log.warn("Event not found", { eventId: id });
    return notFound("Event not found");
  }

  const previousOutcome = (existing as { outcome?: string | null }).outcome ?? null;

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("events")
    .update(updateRow)
    .eq("id", id)
    .select("*")
    .single();

  if (updateError) {
    const status = statusFromSupabaseError(updateError.code);
    log.error("Event context update failed", {
      error: updateError.message,
      status,
      eventId: id,
    });
    return errorResponse(status, updateError.message);
  }

  if (data.outcome !== undefined) {
    updateSequenceStatsForEvent(id, previousOutcome).catch((err) =>
      log.warn("Scenario sequence stats update failed", {
        eventId: id,
        message: err instanceof Error ? err.message : String(err),
      })
    );
  }

  log.info("Event context updated", { eventId: id });
  return NextResponse.json(updated);
}
