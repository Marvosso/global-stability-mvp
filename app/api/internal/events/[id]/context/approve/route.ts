/**
 * POST /api/internal/events/[id]/context/approve
 * Sets event_context.status = 'Approved', reviewed_by, reviewed_at. Admin/Reviewer only.
 */

import { NextRequest, NextResponse } from "next/server";
import { uuidSchema } from "../../../../../_lib/validation";
import { supabaseAdmin } from "../../../../../_lib/db";
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
  context: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const params = await context.params;
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

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("event_context")
    .select("event_id, summary, why_it_matters, likely_driver, uncertainty_note, status, generated_by, created_at, updated_at")
    .eq("event_id", id)
    .maybeSingle();

  if (fetchError) {
    log.error("event_context fetch failed", { error: fetchError.message, eventId: id });
    return internalError(fetchError.message);
  }

  if (!existing) {
    log.warn("event_context not found", { eventId: id });
    return notFound("Event context not found");
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("event_context")
    .update({
      status: "Approved",
      reviewed_by: ctx.userId,
      reviewed_at: now,
      updated_at: now,
    })
    .eq("event_id", id)
    .select()
    .single();

  if (updateError) {
    log.error("event_context approve failed", { error: updateError.message, eventId: id });
    return internalError(updateError.message);
  }

  log.info("Context approved", { eventId: id });
  return NextResponse.json(updated);
}
