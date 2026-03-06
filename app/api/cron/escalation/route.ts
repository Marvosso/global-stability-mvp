/**
 * Vercel Cron: Escalation detection.
 * GET /api/cron/escalation — requires x-cron-key header, runs runEscalationDetection().
 */

import { NextRequest, NextResponse } from "next/server";
import { runEscalationDetection } from "@/lib/escalation/runEscalationDetection";

function verifyCronKey(
  request: NextRequest
): { ok: true } | { ok: false; status: 401; body: object } {
  const key = (process.env.CRON_KEY ?? "").trim();
  if (!key) {
    return { ok: false, status: 401, body: { error: "CRON_KEY not configured" } };
  }
  const header = request.headers.get("x-cron-key");
  if (header !== key) {
    return { ok: false, status: 401, body: { error: "Unauthorized" } };
  }
  return { ok: true };
}

export async function GET(request: NextRequest) {
  const auth = verifyCronKey(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  try {
    const result = await runEscalationDetection();
    return NextResponse.json({ created: result.created });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Escalation detection failed", message },
      { status: 500 }
    );
  }
}
