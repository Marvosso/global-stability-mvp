import { uuidSchema, sourceUpdateSchema } from "../../../_lib/validation";
import { supabaseAdmin } from "../../../_lib/db";
import { requireAdmin } from "@/lib/rbac";
import { normalizeDomainFromUrl } from "@/lib/domain";
import { createRequestLogger } from "@/lib/logger";
import {
  badRequest,
  notFound,
  internalError,
  statusFromSupabaseError,
  errorResponse,
  responseFromThrown,
} from "@/lib/apiError";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const params = await context.params;
  const idResult = uuidSchema.safeParse(params?.id);
  if (!idResult.success) {
    return badRequest("Invalid source id");
  }
  const id = idResult.data;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const log = createRequestLogger({ requestId });
    log.warn("Invalid JSON");
    return badRequest("Invalid JSON");
  }

  const parsed = sourceUpdateSchema.safeParse(body);
  if (!parsed.success) {
    const log = createRequestLogger({ requestId });
    log.warn("Validation failed", { path: "body" });
    return badRequest("Validation failed", parsed.error.flatten());
  }

  const data = parsed.data;
  const keys = Object.keys(data).filter(
    (k) => data[k as keyof typeof data] !== undefined
  );
  if (keys.length === 0) {
    return badRequest("No fields to update");
  }

  let ctx;
  try {
    ctx = await requireAdmin(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    throw err;
  }

  const log = createRequestLogger({ requestId, role: ctx.role });

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("sources")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existing) {
    log.warn("Source not found", { sourceId: id });
    return notFound("Source not found");
  }

  const updateRow: Record<string, unknown> = {};
  if (data.name !== undefined) updateRow.name = data.name;
  if (data.source_type !== undefined) updateRow.source_type = data.source_type;
  if (data.url !== undefined) {
    const url = data.url ?? null;
    updateRow.url = url;
    updateRow.domain = url ? normalizeDomainFromUrl(url) : null;
  }
  if (data.ecosystem_key !== undefined)
    updateRow.ecosystem_key = data.ecosystem_key ?? null;
  if (data.reliability_tier !== undefined)
    updateRow.reliability_tier = data.reliability_tier ?? null;

  const { data: source, error: updateError } = await supabaseAdmin
    .from("sources")
    .update(updateRow)
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    const status = statusFromSupabaseError(updateError.code);
    log.error("Source update failed", {
      error: updateError.message,
      status,
      sourceId: id,
    });
    return errorResponse(status, updateError.message);
  }

  log.info("Source updated", { sourceId: id });
  return NextResponse.json(source);
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const params = await context.params;
  const idResult = uuidSchema.safeParse(params?.id);
  if (!idResult.success) {
    return badRequest("Invalid source id");
  }
  const id = idResult.data;

  let ctx;
  try {
    ctx = await requireAdmin(_request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    throw err;
  }

  const log = createRequestLogger({ requestId, role: ctx.role });

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("sources")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !existing) {
    log.warn("Source not found", { sourceId: id });
    return notFound("Source not found");
  }

  const { error: deleteError } = await supabaseAdmin
    .from("sources")
    .delete()
    .eq("id", id);

  if (deleteError) {
    const status = statusFromSupabaseError(deleteError.code);
    log.error("Source delete failed", {
      error: deleteError.message,
      status,
      sourceId: id,
    });
    return errorResponse(
      status,
      deleteError.code === "23503"
        ? "Source is referenced by events and cannot be deleted"
        : deleteError.message
    );
  }

  log.info("Source deleted", { sourceId: id });
  return new NextResponse(null, { status: 204 });
}
