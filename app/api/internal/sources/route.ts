import { sourceCreateSchema } from "../../_lib/validation";
import { supabaseAdmin } from "../../_lib/db";
import { getUserRole } from "@/lib/rbac";
import { normalizeDomainFromUrl } from "@/lib/domain";
import { createRequestLogger } from "@/lib/logger";
import {
  badRequest,
  forbidden,
  internalError,
  statusFromSupabaseError,
  unauthorized,
  errorResponse,
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
  if (ctx.role !== "Admin" && ctx.role !== "Reviewer" && ctx.role !== "AI") {
    const log = createRequestLogger({ requestId, role: ctx.role });
    log.warn("Forbidden");
    return forbidden();
  }

  const log = createRequestLogger({ requestId, role: ctx.role });
  const { data, error } = await supabaseAdmin
    .from("sources")
    .select("id,name,source_type,url,domain,ecosystem_key,reliability_tier,created_at,updated_at")
    .order("name", { ascending: true });

  if (error) {
    log.error("Sources query failed", { error: error.message });
    return internalError(error.message);
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const log = createRequestLogger({ requestId });
    log.warn("Invalid JSON");
    return badRequest("Invalid JSON");
  }

  const parsed = sourceCreateSchema.safeParse(body);
  if (!parsed.success) {
    const log = createRequestLogger({ requestId });
    log.warn("Validation failed", { path: "body" });
    return badRequest("Validation failed", parsed.error.flatten());
  }

  const ctx = await getUserRole(request);
  if (!ctx) {
    const log = createRequestLogger({ requestId });
    log.warn("Unauthorized");
    return unauthorized();
  }
  if (ctx.role !== "Admin" && ctx.role !== "AI") {
    const log = createRequestLogger({ requestId, role: ctx.role });
    log.warn("Forbidden");
    return forbidden();
  }

  const log = createRequestLogger({ requestId, role: ctx.role });
  const data = parsed.data;

  const url = data.url ?? null;
  const domain = url ? normalizeDomainFromUrl(url) : null;

  const row = {
    name: data.name,
    source_type: data.source_type,
    url,
    domain,
    ecosystem_key: data.ecosystem_key ?? null,
    reliability_tier: data.reliability_tier ?? null,
  };

  const { data: source, error: insertError } = await supabaseAdmin
    .from("sources")
    .insert(row)
    .select()
    .single();

  if (insertError) {
    const status = statusFromSupabaseError(insertError.code);
    log.error("Source insert failed", { error: insertError.message, status });
    return errorResponse(status, insertError.message);
  }

  log.info("Source created", { sourceId: source.id });
  return NextResponse.json(source, { status: 201 });
}
