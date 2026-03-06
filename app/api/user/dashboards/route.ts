/**
 * GET /api/user/dashboards
 * Returns the authenticated user's dashboards (Phase 15C).
 *
 * POST /api/user/dashboards
 * Creates a new dashboard. Body: { name, filters? }.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { requirePremium } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import { dashboardCreateSchema } from "@/app/api/_lib/validation";
import {
  badRequest,
  responseFromThrown,
  unauthorized,
  internalError,
} from "@/lib/apiError";

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  let ctx;
  try {
    ctx = await requirePremium(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    return unauthorized();
  }

  const log = createRequestLogger({ requestId });

  const { data: rows, error } = await supabaseAdmin
    .from("user_dashboards")
    .select("id, user_id, name, filters, created_at")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false });

  if (error) {
    log.error("Dashboards query failed", { error: error.message });
    return internalError(error.message);
  }

  return NextResponse.json(rows ?? []);
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  let ctx;
  try {
    ctx = await requirePremium(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    return unauthorized();
  }

  const log = createRequestLogger({ requestId });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const parsed = dashboardCreateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.flatten().formErrors.join("; ") || "Validation failed");
  }

  const { name, filters } = parsed.data;
  const filtersJson = filters && typeof filters === "object" ? filters : {};

  const { data: row, error } = await supabaseAdmin
    .from("user_dashboards")
    .insert({
      user_id: ctx.userId,
      name,
      filters: filtersJson,
    })
    .select("id, user_id, name, filters, created_at")
    .single();

  if (error) {
    log.error("Dashboard insert failed", { error: error.message });
    return internalError(error.message);
  }

  log.info("Dashboard created", { dashboardId: row.id, name });
  return NextResponse.json(row, { status: 201 });
}
