/**
 * GET /api/internal/review/under-review
 * Returns events with status='UnderReview' ordered by created_at desc (limit 100).
 * Auth: Admin and Reviewer only.
 */

import { supabaseAdmin } from "../../../_lib/db";
import { requireReviewer } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import { responseFromThrown, internalError } from "@/lib/apiError";
import { NextRequest, NextResponse } from "next/server";

const LIMIT = 100;

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  let ctx: { userId: string; role: "Admin" | "Reviewer" } | undefined;
  try {
    ctx = await requireReviewer(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    throw err;
  }

  const log = createRequestLogger({ requestId, role: ctx.role });
  const { data, error } = await supabaseAdmin
    .from("events")
    .select("id, title, category, subtype, severity, confidence_level, occurred_at, created_at")
    .eq("status", "UnderReview")
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  if (error) {
    log.error("Under-review events query failed", { error: error.message });
    return internalError(error.message);
  }

  const list = data ?? [];
  log.info("Under-review events listed", { count: list.length });
  return NextResponse.json(list);
}
