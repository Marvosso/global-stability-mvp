/**
 * POST /api/internal/events/[id]/claims/candidates/[candidateId]/approve
 * Moves a candidate to event_claims and deletes the candidate.
 * Body: { evidence_source_url?: string } optional when candidate has null.
 * Admin/Reviewer only.
 */

import { NextRequest, NextResponse } from "next/server";
import { uuidSchema, approveClaimCandidateSchema } from "@/app/api/_lib/validation";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { requireReviewer } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import {
  badRequest,
  notFound,
  internalError,
  responseFromThrown,
} from "@/lib/apiError";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; candidateId: string }> }
) {
  const requestId = crypto.randomUUID();
  const params = await context.params;
  const idResult = uuidSchema.safeParse(params?.id);
  const candidateIdResult = uuidSchema.safeParse(params?.candidateId);
  if (!idResult.success || !candidateIdResult.success) {
    return badRequest("Invalid event id or candidate id");
  }
  const id = idResult.data;
  const candidateId = candidateIdResult.data;

  let body: Record<string, unknown> = {};
  try {
    const raw = await request.json();
    if (raw && typeof raw === "object") body = raw as Record<string, unknown>;
  } catch {
    // empty body allowed
  }
  const bodyResult = approveClaimCandidateSchema.safeParse(body);
  if (!bodyResult.success) {
    return badRequest(
      bodyResult.error.flatten().fieldErrors
        ? JSON.stringify(bodyResult.error.flatten().fieldErrors)
        : "Invalid body"
    );
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

  const { data: candidate, error: candidateError } = await supabaseAdmin
    .from("event_claim_candidates")
    .select("id, event_id, claim_text, claim_type, actor_name, classification, confidence_level, evidence_source_url")
    .eq("id", candidateId)
    .single();

  if (candidateError || !candidate) {
    log.warn("Claim candidate not found", { candidateId });
    return notFound("Claim candidate not found");
  }
  if ((candidate as { event_id: string }).event_id !== id) {
    return badRequest("Candidate does not belong to this event");
  }

  const c = candidate as {
    claim_text: string;
    claim_type: string | null;
    actor_name: string | null;
    classification: string | null;
    confidence_level: string | null;
    evidence_source_url: string | null;
  };
  const evidenceSourceUrl = bodyResult.data.evidence_source_url ?? c.evidence_source_url;
  if (!evidenceSourceUrl?.trim()) {
    return badRequest("Evidence source URL is required (candidate has none; provide in body)");
  }

  const { data: newClaim, error: insertError } = await supabaseAdmin
    .from("event_claims")
    .insert({
      event_id: id,
      claim_text: c.claim_text,
      claim_type: c.claim_type,
      actor_name: c.actor_name,
      classification: c.classification ?? "Disputed Claim",
      confidence_level: c.confidence_level ?? "Medium",
      evidence_source_url: evidenceSourceUrl.trim(),
    })
    .select()
    .single();

  if (insertError) {
    log.error("event_claims insert failed on approve", {
      error: insertError.message,
      candidateId,
    });
    return internalError(insertError.message);
  }

  const { error: deleteError } = await supabaseAdmin
    .from("event_claim_candidates")
    .delete()
    .eq("id", candidateId);

  if (deleteError) {
    log.error("event_claim_candidates delete failed after approve", {
      error: deleteError.message,
      candidateId,
    });
    return internalError(deleteError.message);
  }

  log.info("Claim candidate approved", { eventId: id, candidateId, claimId: newClaim?.id });
  return NextResponse.json(newClaim);
}
