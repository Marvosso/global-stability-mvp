/**
 * GET /api/user/dashboards/[id]
 * Returns a single dashboard owned by the authenticated user.
 *
 * PATCH /api/user/dashboards/[id]
 * Updates name and/or filters.
 *
 * DELETE /api/user/dashboards/[id]
 * Deletes the dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { uuidSchema, dashboardUpdateSchema } from "@/app/api/_lib/validation";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { requirePremium } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import {
  badRequest,
  notFound,
  responseFromThrown,
  unauthorized,
  internalError,
} from "@/lib/apiError";

async function getDashboardOr404(
  id: string,
  userId: string,
  log: ReturnType<typeof createRequestLogger>
) {
  const { data, error } = await supabaseAdmin
    .from("user_dashboards")
    .select("id, user_id, name, filters, created_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    log.error("Dashboard fetch failed", { error: error.message, dashboardId: id });
    return { row: null, error: internalError(error.message) };
  }
  if (!data) {
    log.warn("Dashboard not found", { dashboardId: id });
    return { row: null, error: notFound("Dashboard not found") };
  }
  return { row: data, error: null };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const params = await context.params;
  const idResult = uuidSchema.safeParse(params?.id);
  if (!idResult.success) {
    return badRequest("Invalid dashboard id");
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
  const { row, error } = await getDashboardOr404(id, ctx.userId, log);
  if (error) return error;
  return NextResponse.json(row);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const params = await context.params;
  const idResult = uuidSchema.safeParse(params?.id);
  if (!idResult.success) {
    return badRequest("Invalid dashboard id");
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
  const { row: existing, error: fetchErr } = await getDashboardOr404(id, ctx.userId, log);
  if (fetchErr) return fetchErr;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = dashboardUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.flatten().formErrors.join("; ") || "Validation failed");
  }

  const updates: { name?: string; filters?: Record<string, unknown> } = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.filters !== undefined) {
    updates.filters = typeof parsed.data.filters === "object" && parsed.data.filters !== null
      ? (parsed.data.filters as Record<string, unknown>)
      : {};
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(existing);
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("user_dashboards")
    .update(updates)
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .select("id, user_id, name, filters, created_at")
    .single();

  if (updateError) {
    log.error("Dashboard update failed", { error: updateError.message, dashboardId: id });
    return internalError(updateError.message);
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const params = await context.params;
  const idResult = uuidSchema.safeParse(params?.id);
  if (!idResult.success) {
    return badRequest("Invalid dashboard id");
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
  const { error: fetchErr } = await getDashboardOr404(id, ctx.userId, log);
  if (fetchErr) return fetchErr;

  const { error: deleteError } = await supabaseAdmin
    .from("user_dashboards")
    .delete()
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (deleteError) {
    log.error("Dashboard delete failed", { error: deleteError.message, dashboardId: id });
    return internalError(deleteError.message);
  }

  log.info("Dashboard deleted", { dashboardId: id });
  return new NextResponse(null, { status: 204 });
}
