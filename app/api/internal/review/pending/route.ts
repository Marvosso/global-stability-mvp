import { supabaseAdmin } from "../../../_lib/db";
import { requireReviewer } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import { responseFromThrown, internalError } from "@/lib/apiError";
import { NextRequest, NextResponse } from "next/server";

const PENDING_LIMIT = 50;

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
    .select("*")
    .eq("status", "UnderReview")
    .order("updated_at", { ascending: false })
    .limit(PENDING_LIMIT);

  if (error) {
    log.error("Pending events query failed", { error: error.message });
    return internalError(error.message);
  }

  const list = data ?? [];
  log.info("Pending events listed", { count: list.length });
  return NextResponse.json(list);
}
