import { z } from "zod";
import { supabaseAdmin } from "../../../_lib/db";
import { reliability_tier } from "../../../_lib/enums";
import { requireAdmin } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import {
  badRequest,
  internalError,
  notFound,
  responseFromThrown,
} from "@/lib/apiError";
import { NextRequest, NextResponse } from "next/server";

const reliabilityTierEnum = z.enum(reliability_tier);

const trustedDomainUpdateSchema = z.object({
  default_reliability_tier: reliabilityTierEnum.optional(),
  is_enabled: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: { domain: string } }
) {
  const requestId = crypto.randomUUID();
  let ctx;
  try {
    ctx = await requireAdmin(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    throw err;
  }

  const domainParam = params?.domain;
  if (!domainParam) {
    return badRequest("Domain is required");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON");
  }
  const parsed = trustedDomainUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Validation failed", parsed.error.flatten());
  }

  const log = createRequestLogger({ requestId, role: ctx.role });
  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    return badRequest("No fields to update");
  }

  const updatePayload: Record<string, unknown> = {};
  if (updates.default_reliability_tier !== undefined)
    updatePayload.default_reliability_tier = updates.default_reliability_tier;
  if (updates.is_enabled !== undefined) updatePayload.is_enabled = updates.is_enabled;
  if (updates.notes !== undefined) updatePayload.notes = updates.notes ?? null;

  const { data, error } = await supabaseAdmin
    .from("trusted_domains")
    .update(updatePayload)
    .eq("domain", domainParam)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // no rows
      return notFound("Trusted domain not found");
    }
    log.error("Trusted domain update failed", { error: error.message });
    return internalError(error.message);
  }

  log.info("Trusted domain updated", { domain: domainParam });
  return NextResponse.json(data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { domain: string } }
) {
  const requestId = crypto.randomUUID();
  let ctx;
  try {
    ctx = await requireAdmin(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    throw err;
  }

  const domainParam = params?.domain;
  if (!domainParam) {
    return badRequest("Domain is required");
  }

  const log = createRequestLogger({ requestId, role: ctx.role });
  const { error } = await supabaseAdmin
    .from("trusted_domains")
    .delete()
    .eq("domain", domainParam);

  if (error) {
    log.error("Trusted domain delete failed", { error: error.message });
    return internalError(error.message);
  }

  log.info("Trusted domain deleted", { domain: domainParam });
  return NextResponse.json({ success: true });
}

