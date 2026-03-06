import {
  uuidSchema,
  approveSourceCandidateSchema,
} from "../../../../_lib/validation";
import { supabaseAdmin } from "../../../../_lib/db";
import { getOrCreateSourceByDomain } from "../../../../_lib/getOrCreateSourceByDomain";
import { requireReviewer } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import {
  badRequest,
  notFound,
  internalError,
  responseFromThrown,
  statusFromSupabaseError,
  errorResponse,
} from "@/lib/apiError";
import { normalizeDomainFromUrl } from "@/lib/domain";
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  const parsed = approveSourceCandidateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Validation failed", parsed.error.flatten());
  }
  const { name, reliability_tier, ecosystem_key, notes } = parsed.data;

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
    .select("id,url,domain,name_guess,suggested_reliability_tier,suggested_ecosystem,status")
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

  const domain = candidate.domain ?? (candidate.url ? normalizeDomainFromUrl(candidate.url) : null);

  let source: { id: string; [key: string]: unknown };
  if (domain != null) {
    const result = await getOrCreateSourceByDomain(domain, {
      name: name.trim(),
      url: candidate.url,
      reliability_tier: reliability_tier ?? candidate.suggested_reliability_tier ?? null,
      ecosystem_key: ecosystem_key?.trim() ?? candidate.suggested_ecosystem ?? null,
      source_type: "Other",
    });
    if (!result) {
      log.error("Could not get or create source", { domain });
      return internalError("Could not get or create source");
    }
    const { data: fullSource, error: fetchErr } = await supabaseAdmin
      .from("sources")
      .select()
      .eq("id", result.id)
      .single();
    if (fetchErr || !fullSource) {
      log.error("Could not fetch source after get-or-create", { sourceId: result.id });
      return internalError("Could not get or create source");
    }
    source = fullSource;
  } else {
    const sourceRow = {
      name: name.trim(),
      source_type: "Other" as const,
      url: candidate.url,
      domain: null as string | null,
      ecosystem_key: ecosystem_key?.trim() ?? candidate.suggested_ecosystem ?? null,
      reliability_tier: reliability_tier ?? candidate.suggested_reliability_tier ?? null,
    };
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("sources")
      .insert(sourceRow)
      .select()
      .single();
    if (insertError) {
      const status = statusFromSupabaseError(insertError.code);
      log.error("Source insert failed", { error: insertError.message });
      return errorResponse(status, insertError.message);
    }
    source = inserted;
  }

  const { error: updateError } = await supabaseAdmin
    .from("source_candidates")
    .update({
      status: "Approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: ctx.userId,
      promoted_to_source_id: source.id,
    })
    .eq("id", id);

  if (updateError) {
    log.error("Candidate update failed", { error: updateError.message });
    return internalError(updateError.message);
  }

  const { error: auditError } = await supabaseAdmin
    .from(SOURCE_CANDIDATE_AUDIT_TABLE)
    .insert({
      source_candidate_id: id,
      action: "approved",
      actor_id: ctx.userId,
      details: notes != null && notes !== "" ? { promoted_to_source_id: source.id, notes } : { promoted_to_source_id: source.id },
    });

  if (auditError) {
    log.error("Audit insert failed", { error: auditError.message });
    return internalError(auditError.message);
  }

  log.info("Source candidate approved", {
    candidateId: id,
    sourceId: source.id,
  });
  return NextResponse.json(source, { status: 200 });
}
