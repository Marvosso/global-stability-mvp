/**
 * Vercel Cron: Escalation detection.
 * GET /api/cron/escalation — requires x-cron-key or Authorization: Bearer, runs runEscalationDetection().
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCronKey } from "@/lib/cronAuth";
import { runEscalationDetection } from "@/lib/escalation/runEscalationDetection";

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
