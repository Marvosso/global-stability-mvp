import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { createRequestLogger } from "@/lib/logger";
import { internalError } from "@/lib/apiError";

/**
 * GET /api/public/escalation-risk
 * Returns region escalation risk scores for map choropleth.
 * Response: { region_code, risk_score, risk_level }[].
 * No auth required.
 */
export async function GET(_request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = createRequestLogger({ requestId });

  const { data: rows, error } = await supabaseAdmin
    .from("region_risk_scores")
    .select("region_code, risk_score, risk_level")
    .order("region_code", { ascending: true });

  if (error) {
    log.error("Escalation risk query failed", { error: error.message });
    return internalError(error.message);
  }

  const list = (rows ?? []).map(
    (r: { region_code: string; risk_score: number; risk_level: string }) => ({
      region_code: r.region_code,
      risk_score: Number(r.risk_score),
      risk_level: r.risk_level,
    })
  );

  log.info("Public escalation-risk listed", { count: list.length });
  return NextResponse.json(list);
}
