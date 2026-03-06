/**
 * POST /api/internal/events/[id]/claims
 * Create a claim for an event. Admin/Reviewer only.
 */

import { uuidSchema, createClaimSchema } from "../../../../_lib/validation";
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

export async function POST(
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
    return badRequest("Invalid JSON body");
  }
  const bodyResult = createClaimSchema.safeParse(body);
  if (!bodyResult.success) {
    return badRequest(
      bodyResult.error.flatten().fieldErrors
        ? JSON.stringify(bodyResult.error.flatten().fieldErrors)
        : "Invalid claim body"
    );
  }
  const data = bodyResult.data;

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
    .select("id")
    .eq("id", id)
    .single();

  if (eventError || !event) {
    log.warn("Event not found", { eventId: id });
    return notFound("Event not found");
  }

  const { data: row, error: insertError } = await supabaseAdmin
    .from("event_claims")
    .insert({
      event_id: id,
      claim_text: data.claim_text,
      claim_type: data.claim_type ?? null,
      actor_name: data.actor_name,
      classification: data.classification,
      evidence_source_url: data.evidence_source_url,
      confidence_level: data.confidence_level,
    })
    .select()
    .single();

  if (insertError) {
    log.error("event_claims insert failed", {
      error: insertError.message,
      eventId: id,
    });
    return internalError(insertError.message);
  }

  log.info("Claim created", { eventId: id, claimId: row?.id });
  return NextResponse.json(row, { status: 201 });
}
