import { z } from "zod";
import { supabaseAdmin } from "../../_lib/db";
import { reliability_tier } from "../../_lib/enums";
import { requireAdmin } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import {
  badRequest,
  internalError,
  responseFromThrown,
} from "@/lib/apiError";
import { normalizeDomainFromUrl } from "@/lib/domain";
import { NextRequest, NextResponse } from "next/server";

const reliabilityTierEnum = z.enum(reliability_tier);

const trustedDomainCreateSchema = z.object({
  domain: z.string().min(1).max(255),
  default_reliability_tier: reliabilityTierEnum,
  is_enabled: z.boolean().optional().default(true),
  notes: z.string().max(2000).optional().nullable(),
});

export async function GET(request: NextRequest) {
  let ctx;
  const requestId = crypto.randomUUID();
  try {
    ctx = await requireAdmin(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    throw err;
  }

  const log = createRequestLogger({ requestId, role: ctx.role });
  const { data, error } = await supabaseAdmin
    .from("trusted_domains")
    .select("domain, default_reliability_tier, is_enabled, notes, created_at")
    .order("domain", { ascending: true });

  if (error) {
    log.error("Trusted domains query failed", { error: error.message });
    return internalError(error.message);
  }

  log.info("Trusted domains listed", { count: (data ?? []).length });
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  let ctx;
  const requestId = crypto.randomUUID();
  try {
    ctx = await requireAdmin(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    throw err;
  }

  const log = createRequestLogger({ requestId, role: ctx.role });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const parsed = trustedDomainCreateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Validation failed", parsed.error.flatten());
  }

  const { domain, default_reliability_tier, is_enabled, notes } = parsed.data;

  const normalized = normalizeDomainFromUrl(domain);
  if (!normalized) {
    return badRequest("Domain could not be normalized");
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("trusted_domains")
    .insert({
      domain: normalized,
      default_reliability_tier,
      is_enabled: is_enabled ?? true,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) {
    log.error("Trusted domain insert failed", { error: error.message });
    return internalError(error.message);
  }

  log.info("Trusted domain created", { domain: normalized });
  return NextResponse.json(inserted, { status: 201 });
}

