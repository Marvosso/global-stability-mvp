/**
 * DELETE /api/internal/events/[id]/claims/candidates/[candidateId]
 * Rejects a candidate (deletes it). Admin/Reviewer only.
 */

import { NextRequest, NextResponse } from "next/server";
import { uuidSchema } from "../../../../../../../../_lib/validation";
import { supabaseAdmin } from "../../../../../../../../_lib/db";
import { requireReviewer } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import {
  badRequest,
  notFound,
  internalError,
  responseFromThrown,
} from "@/lib/apiError";

export async function DELETE(
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

  let ctx;
  try {
    ctx = await requireReviewer(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    throw err;
  }

  const log = createRequestLogger({ requestId, role: ctx.role });

  const { data: candidate, error: fetchError } = await supabaseAdmin
    .from("event_claim_candidates")
    .select("id, event_id")
    .eq("id", candidateId)
    .single();

  if (fetchError || !candidate) {
    log.warn("Claim candidate not found", { candidateId });
    return notFound("Claim candidate not found");
  }
  if ((candidate as { event_id: string }).event_id !== id) {
    return badRequest("Candidate does not belong to this event");
  }

  const { error: deleteError } = await supabaseAdmin
    .from("event_claim_candidates")
    .delete()
    .eq("id", candidateId);

  if (deleteError) {
    log.error("event_claim_candidates delete failed", {
      error: deleteError.message,
      candidateId,
    });
    return internalError(deleteError.message);
  }

  log.info("Claim candidate rejected", { eventId: id, candidateId });
  return new NextResponse(null, { status: 204 });
}
