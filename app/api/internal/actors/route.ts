import { actorCreateSchema } from "../../_lib/validation";
import { supabaseAdmin } from "../../_lib/db";
import { getUserRole } from "@/lib/rbac";
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
    .from("actors")
    .select("id,name,canonical_name,actor_type,alignment,affiliation_label,country_code,notes,created_at,updated_at")
    .order("name", { ascending: true });

  if (error) {
    log.error("Actors query failed", { error: error.message });
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

  const parsed = actorCreateSchema.safeParse(body);
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

  const row = {
    name: data.name,
    canonical_name: data.canonical_name ?? null,
    actor_type: data.actor_type,
    alignment: data.alignment,
    affiliation_label: data.affiliation_label,
    affiliated_to_actor_id: data.affiliated_to_actor_id ?? null,
    country_code: data.country_code ?? null,
    notes: data.notes ?? null,
  };

  const { data: actor, error: insertError } = await supabaseAdmin
    .from("actors")
    .insert(row)
    .select()
    .single();

  if (insertError) {
    const status = statusFromSupabaseError(insertError.code);
    log.error("Actor insert failed", { error: insertError.message, status });
    return errorResponse(status, insertError.message);
  }

  log.info("Actor created", { actorId: actor.id });
  return NextResponse.json(actor, { status: 201 });
}
