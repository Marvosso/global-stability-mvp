import { supabaseAdmin } from "../../_lib/db";
import { getUserRole } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import { forbidden, internalError, unauthorized } from "@/lib/apiError";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const ctx = await getUserRole(request);
  if (!ctx) {
    const log = createRequestLogger({ requestId });
    log.warn("Unauthorized");
    return unauthorized();
  }
  if (ctx.role !== "Admin" && ctx.role !== "Reviewer" && ctx.role !== "AI") {
    const log = createRequestLogger({ requestId, role: ctx.role });
    log.warn("Forbidden");
    return forbidden();
  }

  const log = createRequestLogger({ requestId, role: ctx.role });
  const { data, error } = await supabaseAdmin
    .from("ingestion_runs")
    .select("id, feed_key, started_at, finished_at, items_fetched, processed, skipped, status, error_message")
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) {
    log.error("ingestion_runs query failed", { error: error.message });
    return internalError(error.message);
  }

  return NextResponse.json(data ?? []);
}
