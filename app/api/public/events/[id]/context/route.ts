/**
 * GET /api/public/events/[id]/context
 * Returns event_context, claims, and facts for a published event only. 404 if not found or not Published.
 */

import { supabaseAdmin } from "../../../../_lib/db";
import { createRequestLogger } from "../../../../../../lib/logger";
import { notFound, internalError } from "../../../../../../lib/apiError";
import { uuidSchema } from "@/app/api/_lib/validation";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const params = await context.params;
  const idResult = uuidSchema.safeParse(params?.id);
  if (!idResult.success) {
    return notFound("Event not found");
  }
  const id = idResult.data;

  const log = createRequestLogger({ requestId });

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (eventError) {
    log.error("Event lookup failed", { error: eventError.message, eventId: id });
    return internalError(eventError.message);
  }

  if (!event || event.status !== "Published") {
    return notFound("Event not found");
  }

  const [{ data: eventContext, error: ctxError }, { data: claims, error: claimsError }, { data: facts, error: factsError }] = await Promise.all([
    supabaseAdmin
      .from("event_context")
      .select("one_paragraph_summary, background, trigger, updated_at")
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
  ]);

  if (ctxError || claimsError || factsError) {
    log.error("Context fetch failed", {
      ctxError: ctxError?.message,
      claimsError: claimsError?.message,
      factsError: factsError?.message,
      eventId: id,
    });
    return internalError(ctxError?.message ?? claimsError?.message ?? factsError?.message ?? "Unknown error");
  }

  return NextResponse.json({
    event_context: eventContext ?? null,
    claims: claims ?? [],
    facts: facts ?? [],
  });
}
