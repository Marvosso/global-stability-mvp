/**
 * PATCH /api/internal/events/[id]/context
 * Update event_context editable fields (summary, why_it_matters, likely_driver, uncertainty_note). Admin/Reviewer only.
 */

import { NextRequest, NextResponse } from "next/server";
import { uuidSchema, eventContextAnalysisUpdateSchema } from "../../../../_lib/validation";
import { supabaseAdmin } from "../../../../_lib/db";
import { requireReviewer } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import {
  badRequest,
  notFound,
  internalError,
  responseFromThrown,
} from "@/lib/apiError";

export async function PATCH(
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const parsed = eventContextAnalysisUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Validation failed", parsed.error.flatten());
  }

  const data = parsed.data;
  const updateRow: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (data.summary !== undefined) updateRow.summary = data.summary;
  if (data.why_it_matters !== undefined) updateRow.why_it_matters = data.why_it_matters;
  if (data.likely_driver !== undefined) updateRow.likely_driver = data.likely_driver;
  if (data.uncertainty_note !== undefined) updateRow.uncertainty_note = data.uncertainty_note;

  if (Object.keys(updateRow).length <= 1) {
    return badRequest("No context fields to update");
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("event_context")
    .select("event_id")
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

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("event_context")
    .update(updateRow)
    .eq("event_id", id)
    .select()
    .single();

  if (updateError) {
    log.error("event_context update failed", { error: updateError.message, eventId: id });
    return internalError(updateError.message);
  }

  log.info("Context analysis updated", { eventId: id });
  return NextResponse.json(updated);
}
