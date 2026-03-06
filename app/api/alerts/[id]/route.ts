import { uuidSchema } from "@/app/api/_lib/validation";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { requirePremium } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import {
  badRequest,
  notFound,
  responseFromThrown,
  internalError,
  unauthorized,
} from "@/lib/apiError";
import { NextRequest, NextResponse } from "next/server";

/**
 * PATCH /api/alerts/[id]
 * Mark alert as read (set read_at to now). Caller must own the alert.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const params = await context.params;
  const idResult = uuidSchema.safeParse(params?.id);
  if (!idResult.success) {
    return badRequest("Invalid alert id");
  }
  const id = idResult.data;

  let ctx;
  try {
    ctx = await requirePremium(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    return unauthorized();
  }

  const log = createRequestLogger({ requestId });

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("alerts")
    .select("id")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (fetchError || !existing) {
    log.warn("Alert not found", { alertId: id });
    return notFound("Alert not found");
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("alerts")
    .update({ read_at: now })
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .select()
    .single();

  if (updateError) {
    log.error("Alert update failed", { error: updateError.message, alertId: id });
    return internalError(updateError.message);
  }

  return NextResponse.json(updated);
}
