/**
 * POST /api/internal/events/[id]/claims/extract
 * Extracts claims from article text via AI and stores them in event_claim_candidates.
 * Body: { event_source_id } OR { article_text, source_name, evidence_source_url? }.
 * Admin/Reviewer only.
 */

import { NextRequest, NextResponse } from "next/server";
import { uuidSchema, extractClaimsBodySchema } from "../../../../../../_lib/validation";
import { supabaseAdmin } from "../../../../../../_lib/db";
import { requireReviewer } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import {
  badRequest,
  notFound,
  internalError,
  responseFromThrown,
} from "@/lib/apiError";
import { extractClaims } from "@/lib/ai/extractClaims";

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const bodyResult = extractClaimsBodySchema.safeParse(body);
  if (!bodyResult.success) {
    return badRequest(
      bodyResult.error.flatten().fieldErrors
        ? JSON.stringify(bodyResult.error.flatten().fieldErrors)
        : bodyResult.error.message ?? "Invalid body"
    );
  }
  const data = bodyResult.data;

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

  let articleText: string;
  let sourceName: string;
  let evidenceSourceUrl: string | null = null;
  let eventSourceId: string | null = null;

  if (data.event_source_id) {
    const { data: row, error: srcError } = await supabaseAdmin
      .from("event_sources")
      .select("event_id, raw_excerpt, claim_url, sources(id, name)")
      .eq("id", data.event_source_id)
      .single();

    if (srcError || !row) {
      log.warn("Event source not found", { event_source_id: data.event_source_id });
      return notFound("Event source not found");
    }
    if ((row as { event_id: string }).event_id !== id) {
      return badRequest("Event source does not belong to this event");
    }
    const r = row as {
      raw_excerpt?: string | null;
      claim_url?: string | null;
      sources?: { id: string; name: string | null } | null;
    };
    articleText = (r.raw_excerpt ?? "").trim();
    if (!articleText) {
      return badRequest("Event source has no article text (raw_excerpt)");
    }
    sourceName = r.sources?.name?.trim() ?? "Unknown source";
    evidenceSourceUrl = r.claim_url?.trim() ?? null;
    eventSourceId = data.event_source_id;
  } else {
    articleText = (data.article_text ?? "").trim();
    sourceName = (data.source_name ?? "").trim();
    evidenceSourceUrl = data.evidence_source_url?.trim() ?? null;
  }

  let result: { claims: Array<{ actor_name: string; claim_text: string; claim_type: string | null; classification: "Verified Event" | "Disputed Claim"; confidence: string }>; model: string };
  try {
    result = await extractClaims(
      { articleText, sourceName, eventId: id },
      undefined
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Claim extraction failed";
    log.error("extractClaims failed", { eventId: id, message });
    return internalError(message);
  }

  const { claims, model } = result;
  if (claims.length === 0) {
    return NextResponse.json([], { status: 201 });
  }

  const rows = claims.map((c) => ({
    event_id: id,
    event_source_id: eventSourceId,
    claim_text: c.claim_text,
    claim_type: c.claim_type,
    actor_name: c.actor_name,
    classification: c.classification,
    confidence_level: c.confidence,
    evidence_source_url: evidenceSourceUrl,
    source_name: sourceName,
    model,
  }));

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("event_claim_candidates")
    .insert(rows)
    .select("id, event_id, claim_text, claim_type, actor_name, classification, confidence_level, evidence_source_url, source_name, model, created_at");

  if (insertError) {
    log.error("event_claim_candidates insert failed", {
      error: insertError.message,
      eventId: id,
    });
    return internalError(insertError.message);
  }

  log.info("Claims extracted", { eventId: id, count: inserted?.length ?? 0 });
  return NextResponse.json(inserted ?? [], { status: 201 });
}
