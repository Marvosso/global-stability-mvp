import { uuidSchema } from "../../../../_lib/validation";
import { supabaseAdmin } from "../../../../_lib/db";
import { enforceWorkflowTransition } from "../../../../_lib/workflow";
import { createAlertsForPublishedEvent } from "../../../../_lib/createAlertsForPublishedEvent";
import { generateDraftBriefing } from "@/lib/briefing/generateDraftBriefing";
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

  let ctx;
  try {
    ctx = await requireReviewer(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    throw err;
  }

  const log = createRequestLogger({ requestId, role: ctx.role });
  const { data: event, error: fetchError } = await supabaseAdmin
    .from("events")
    .select("id, status, requires_dual_review, last_reviewed_by")
    .eq("id", id)
    .single();

  if (fetchError || !event) {
    log.warn("Event not found", { eventId: id });
    return notFound("Event not found");
  }

  let decision;
  try {
    decision = enforceWorkflowTransition(
      {
        status: event.status,
        requires_dual_review: event.requires_dual_review ?? false,
        last_reviewed_by: event.last_reviewed_by
      },
      ctx.userId,
      "publish"
    );
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    throw err;
  }

  const updatePayload: { status: string; last_reviewed_by?: string } = {
    status: decision.nextStatus
  };
  if (decision.updateLastReviewedBy) {
    updatePayload.last_reviewed_by = ctx.userId;
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("events")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    log.error("Approve update failed", { error: updateError.message, eventId: id });
    return internalError(updateError.message);
  }

  if (decision.nextStatus === "Published") {
    const alertCount = await createAlertsForPublishedEvent(id);
    if (alertCount > 0) {
      log.info("Alerts created for published event", { eventId: id, alertCount });
    }
    generateDraftBriefing(id).catch((err) =>
      log.error("briefing_generation_failed", { eventId: id, message: err instanceof Error ? err.message : String(err) })
    );
  }

  log.info("Event approved", { eventId: id, nextStatus: decision.nextStatus });
  return NextResponse.json(updated);
}
