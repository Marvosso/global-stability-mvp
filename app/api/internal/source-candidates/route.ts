import { sourceCandidatesQuerySchema } from "../../_lib/validation";
import { supabaseAdmin } from "../../_lib/db";
import { getUserRole } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import {
  badRequest,
  forbidden,
  internalError,
  unauthorized,
} from "@/lib/apiError";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const ctx = await getUserRole(request);
  if (!ctx) {
    const log = createRequestLogger({ requestId });
    log.warn("Unauthorized");
    return unauthorized();
  }
  if (ctx.role !== "Admin" && ctx.role !== "Reviewer") {
    const log = createRequestLogger({ requestId, role: ctx.role });
    log.warn("Forbidden");
    return forbidden();
  }

  const { searchParams } = new URL(request.url);
  const parsed = sourceCandidatesQuerySchema.safeParse({
    status: searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) {
    return badRequest("Invalid query", parsed.error.flatten());
  }
  const { status } = parsed.data;

  const log = createRequestLogger({ requestId, role: ctx.role });
  const { data, error } = await supabaseAdmin
    .from("source_candidates")
    .select(
      "id,url,domain,name_guess,suggested_reliability_tier,suggested_ecosystem,evidence_excerpt,discovered_from_event_id,status,created_at"
    )
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (error) {
    log.error("Source candidates query failed", { error: error.message });
    return internalError(error.message);
  }

  const candidates = data ?? [];

  // Hide candidates whose domain already exists as a source.
  const domains = Array.from(
    new Set(
      candidates
        .map((c) => c.domain)
        .filter((d): d is string => typeof d === "string" && d.length > 0)
    )
  );

  let filtered = candidates;

  if (domains.length > 0) {
    const { data: sourceDomains, error: sourcesError } = await supabaseAdmin
      .from("sources")
      .select("domain")
      .in("domain", domains);

    if (sourcesError) {
      log.error("Sources domain query failed", { error: sourcesError.message });
      return internalError(sourcesError.message);
    }

    const domainSet = new Set(
      (sourceDomains ?? [])
        .map((row) => row.domain)
        .filter((d): d is string => typeof d === "string" && d.length > 0)
    );

    filtered = candidates.filter(
      (c) => !c.domain || !domainSet.has(c.domain)
    );
  }

  log.info("Source candidates listed", {
    status,
    count: filtered.length,
    total: candidates.length,
  });
  return NextResponse.json(filtered);
}
