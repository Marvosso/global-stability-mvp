import { uuidSchema } from "@/app/api/_lib/validation";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { requireAuth } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import {
  badRequest,
  notFound,
  responseFromThrown,
  statusFromSupabaseError,
  errorResponse,
  unauthorized,
} from "@/lib/apiError";
import { NextRequest, NextResponse } from "next/server";

/**
 * DELETE /api/watchlists/[id]
 * Deletes a Phase 15A watchlist entry owned by the authenticated user.
 * (Same table as /api/user/watchlists/[id]; this route is kept for backward compatibility.)
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const params = await context.params;
  const idResult = uuidSchema.safeParse(params?.id);
  if (!idResult.success) {
    return badRequest("Invalid watchlist id");
  }
  const id = idResult.data;

  let ctx;
  try {
    ctx = await requireAuth(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    return unauthorized();
  }

  const log = createRequestLogger({ requestId });

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("user_watchlists")
    .select("id")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (fetchError || !existing) {
    log.warn("Watchlist not found", { watchlistId: id });
    return notFound("Watchlist not found");
  }

  const { error: deleteError } = await supabaseAdmin
    .from("user_watchlists")
    .delete()
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (deleteError) {
    const status = statusFromSupabaseError(deleteError.code);
    log.error("Watchlist delete failed", {
      error: deleteError.message,
      status,
      watchlistId: id,
    });
    return errorResponse(status, deleteError.message);
  }

  log.info("Watchlist deleted", { watchlistId: id });
  return new NextResponse(null, { status: 204 });
}
