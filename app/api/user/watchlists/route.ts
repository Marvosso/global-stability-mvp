/**
 * GET /api/user/watchlists
 * Returns the authenticated user's watchlist entries (Phase 15A row-based model).
 *
 * POST /api/user/watchlists
 * Creates a new watchlist entry. Body: { watch_type, watch_value, email_notifications? }.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { requireAuth } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import { watchlistEntryCreateSchema } from "@/app/api/_lib/validation";
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
    ctx = await requireAuth(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    return unauthorized();
  }

  const log = createRequestLogger({ requestId });

  const { data: rows, error } = await supabaseAdmin
    .from("user_watchlists")
    .select("id, user_id, watch_type, watch_value, email_notifications, created_at")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false });

  if (error) {
    log.error("Watchlists query failed", { error: error.message });
    return internalError(error.message);
  }

  return NextResponse.json(rows ?? []);
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  let ctx;
  try {
    ctx = await requireAuth(request);
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

  const parsed = watchlistEntryCreateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.flatten().formErrors.join("; ") || "Validation failed");
  }

  const { watch_type, watch_value, email_notifications } = parsed.data;

  const { data: row, error } = await supabaseAdmin
    .from("user_watchlists")
    .insert({
      user_id: ctx.userId,
      watch_type,
      watch_value,
      email_notifications: email_notifications ?? false,
    })
    .select("id, user_id, watch_type, watch_value, email_notifications, created_at")
    .single();

  if (error) {
    log.error("Watchlist insert failed", { error: error.message });
    return internalError(error.message);
  }

  log.info("Watchlist entry created", { watchlistId: row.id, watch_type, watch_value });
  return NextResponse.json(row, { status: 201 });
}
