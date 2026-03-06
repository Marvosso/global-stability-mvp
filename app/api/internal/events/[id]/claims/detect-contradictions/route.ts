/**
 * POST /api/internal/events/[id]/claims/detect-contradictions
 * Runs AI contradiction detection on event claims and stores results in claim_conflicts.
 * Admin/Reviewer only.
 */

import { NextRequest, NextResponse } from "next/server";
import { uuidSchema } from "@/app/api/_lib/validation";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { requireReviewer } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import {
  badRequest,
  notFound,
  internalError,
  responseFromThrown,
} from "@/lib/apiError";
import { detectContradictions } from "@/lib/ai/detectContradictions";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const params = await context.params;
  const idResult = uuidSchema.safeParse(params?.id);
  if (!idResult.success) {
    return badRequest("Invalid event id");
  }
  const id = idResult.data;

  let ctx;
  try {
    ctx = await requireReviewer(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    throw err;
  }

  const log = createRequestLogger({ requestId, role: ctx.role });

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id")
    .eq("id", id)
    .single();

  if (eventError || !event) {
    log.warn("Event not found", { eventId: id });
    return notFound("Event not found");
  }

  const { data: claims, error: claimsError } = await supabaseAdmin
    .from("event_claims")
    .select("id, claim_text, actor_name")
    .eq("event_id", id);

  if (claimsError) {
    log.error("event_claims query failed", { eventId: id, error: claimsError.message });
    return internalError(claimsError.message);
  }

  const claimList = (claims ?? []).map((c: { id: string; claim_text: string; actor_name?: string | null }) => ({
    id: c.id,
    claim_text: c.claim_text ?? "",
    actor_name: c.actor_name ?? null,
  }));

  await supabaseAdmin.from("claim_conflicts").delete().eq("event_id", id);

  if (claimList.length < 2) {
    log.info("Contradiction detection skipped", { eventId: id, reason: "fewer than 2 claims" });
    return NextResponse.json({ pairs: 0, conflicts: [] });
  }

  let result: { pairs: Array<{ claim_a_id: string; claim_b_id: string; conflict_score: number; reason: string }>; model: string };
  try {
    result = await detectContradictions(claimList, undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Contradiction detection failed";
    log.error("detectContradictions failed", { eventId: id, message });
    return internalError(message);
  }

  const { pairs } = result;
  if (pairs.length === 0) {
    return NextResponse.json({ pairs: 0, conflicts: [] });
  }

  const rows = pairs.map((p) => {
    const a = p.claim_a_id;
    const b = p.claim_b_id;
    return {
      event_id: id,
      claim_a_id: a < b ? a : b,
      claim_b_id: a < b ? b : a,
      conflict_score: p.conflict_score,
      reason: p.reason,
    };
  });

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("claim_conflicts")
    .insert(rows)
    .select("id, event_id, claim_a_id, claim_b_id, conflict_score, reason, created_at");

  if (insertError) {
    log.error("claim_conflicts insert failed", { eventId: id, error: insertError.message });
    return internalError(insertError.message);
  }

  log.info("Contradictions detected", { eventId: id, count: inserted?.length ?? 0 });
  return NextResponse.json({ pairs: inserted?.length ?? 0, conflicts: inserted ?? [] });
}
