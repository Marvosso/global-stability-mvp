import { uuidSchema, rejectSourceCandidateSchema } from "../../../../_lib/validation";
import { supabaseAdmin } from "../../../../_lib/db";
import { requireReviewer } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import {
  badRequest,
  notFound,
  internalError,
  responseFromThrown,
} from "@/lib/apiError";
import { NextRequest, NextResponse } from "next/server";

const SOURCE_CANDIDATE_AUDIT_TABLE = "source_candidate_audit_log" as const;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = crypto.randomUUID();
  const idResult = uuidSchema.safeParse(params?.id);
  if (!idResult.success) {
    return badRequest("Invalid candidate id");
  }
  const id = idResult.data;

  let body: Record<string, unknown> = {};
  try {
    const raw = await request.json();
    if (raw != null && typeof raw === "object") body = raw as Record<string, unknown>;
  } catch {
    // empty body is ok for reject
  }
  const parsed = rejectSourceCandidateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Validation failed", parsed.error.flatten());
  }
  const { reason } = parsed.data;

  let ctx;
  try {
    ctx = await requireReviewer(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    throw err;
  }

  const log = createRequestLogger({ requestId, role: ctx.role });
  const { data: candidate, error: fetchError } = await supabaseAdmin
    .from("source_candidates")
    .select("id,status")
    .eq("id", id)
    .single();

  if (fetchError || !candidate) {
    log.warn("Source candidate not found", { candidateId: id });
    return notFound("Source candidate not found");
  }
  if (candidate.status !== "Pending") {
    log.warn("Source candidate not pending", { candidateId: id, status: candidate.status });
    return badRequest("Candidate is not pending");
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("source_candidates")
    .update({
      status: "Rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: ctx.userId,
    })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    log.error("Candidate update failed", { error: updateError.message });
    return internalError(updateError.message);
  }

  const { error: auditError } = await supabaseAdmin
    .from(SOURCE_CANDIDATE_AUDIT_TABLE)
    .insert({
      source_candidate_id: id,
      action: "rejected",
      actor_id: ctx.userId,
      details: reason != null && reason !== "" ? { reason } : null,
    });

  if (auditError) {
    log.error("Audit insert failed", { error: auditError.message });
    return internalError(auditError.message);
  }

  log.info("Source candidate rejected", { candidateId: id });
  return NextResponse.json(updated);
}
