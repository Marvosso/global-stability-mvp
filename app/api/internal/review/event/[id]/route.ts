/**
 * GET /api/internal/review/event/[id]
 * Returns event by id with linked sources, actors, and optional ingestion payload.
 * Auth: Reviewer and Admin only.
 */

import { uuidSchema } from "../../../../_lib/validation";
import { supabaseAdmin } from "../../../../_lib/db";
import { requireReviewer } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import {
  badRequest,
  notFound,
  internalError,
  responseFromThrown,
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
    log.error("Event actors query failed", {
      error: actorsError.message,
      eventId: id,
    });
    return internalError(actorsError.message);
  }

  const { data: sourcesData, error: sourcesError } = await supabaseAdmin
    .from("event_sources")
    .select(
      "id, source_id, claim_url, claim_timestamp, source_primary_classification, source_secondary_classification, source_confidence_level, raw_excerpt, sources(id, name, source_type, url, reliability_tier)"
    )
    .eq("event_id", id);

  if (sourcesError) {
    log.error("Event sources query failed", {
      error: sourcesError.message,
      eventId: id,
    });
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
    id: row.id,
    source_id: row.source_id,
    claim_url: row.claim_url ?? null,
    claim_timestamp: row.claim_timestamp ?? null,
    source_primary_classification: row.source_primary_classification ?? null,
    source_secondary_classification: row.source_secondary_classification ?? null,
    source_confidence_level: row.source_confidence_level ?? null,
    raw_excerpt: row.raw_excerpt ?? null,
    source: row.sources ?? null,
  }));

  const claimUrls = sources
    .map((s) => s.claim_url)
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  let ingestionPayloads: Array<{ source_url: string; payload: unknown }> = [];
  if (claimUrls.length > 0) {
    const { data: items } = await supabaseAdmin
      .from("ingestion_items")
      .select("source_url, payload")
      .in("source_url", claimUrls);
    ingestionPayloads = (items ?? []).map((row) => ({
      source_url: row.source_url,
      payload: row.payload ?? null,
    }));
  }

  const [
    { data: eventContext },
    { data: eventClaims },
    { data: eventFacts },
    { data: eventClaimCandidates },
    { data: claimConflicts },
  ] = await Promise.all([
    supabaseAdmin
      .from("event_context")
      .select("event_id, one_paragraph_summary, background, trigger, updated_at, summary, why_it_matters, likely_driver, uncertainty_note, generated_by, status, created_at, reviewed_by, reviewed_at")
      .eq("event_id", id)
      .maybeSingle(),
    supabaseAdmin
      .from("event_claims")
      .select("id, claim_text, claim_type, actor_name, classification, evidence_source_url, confidence_level, created_at")
      .eq("event_id", id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("event_facts")
      .select("id, fact_text, evidence_source_url, confidence_level, created_at")
      .eq("event_id", id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("event_claim_candidates")
      .select("id, event_id, claim_text, claim_type, actor_name, classification, confidence_level, evidence_source_url, source_name, model, created_at")
      .eq("event_id", id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("claim_conflicts")
      .select("id, event_id, claim_a_id, claim_b_id, conflict_score, reason, created_at")
      .eq("event_id", id),
  ]);

  const payload = {
    ...event,
    actors,
    sources,
    ingestion_items: ingestionPayloads,
    event_context: eventContext ?? null,
    event_claims: eventClaims ?? [],
    event_facts: eventFacts ?? [],
    event_claim_candidates: eventClaimCandidates ?? [],
    claim_conflicts: claimConflicts ?? [],
  };

  log.info("Review event fetched", { eventId: id });
  return NextResponse.json(payload);
}
