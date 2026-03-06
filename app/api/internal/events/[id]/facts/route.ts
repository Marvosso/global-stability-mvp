/**
 * POST /api/internal/events/[id]/facts
 * Create a fact for an event. Admin/Reviewer only.
 */

import { uuidSchema, createFactSchema } from "../../../../_lib/validation";
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

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = crypto.randomUUID();
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
  const bodyResult = createFactSchema.safeParse(body);
  if (!bodyResult.success) {
    return badRequest(
      bodyResult.error.flatten().fieldErrors
        ? JSON.stringify(bodyResult.error.flatten().fieldErrors)
        : "Invalid fact body"
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

  const { data: row, error: insertError } = await supabaseAdmin
    .from("event_facts")
    .insert({
      event_id: id,
      fact_text: data.fact_text,
      evidence_source_url: data.evidence_source_url ?? null,
      confidence_level: data.confidence_level ?? null,
    })
    .select()
    .single();

  if (insertError) {
    log.error("event_facts insert failed", {
      error: insertError.message,
      eventId: id,
    });
    return internalError(insertError.message);
  }

  log.info("Fact created", { eventId: id, factId: row?.id });
  return NextResponse.json(row, { status: 201 });
}
