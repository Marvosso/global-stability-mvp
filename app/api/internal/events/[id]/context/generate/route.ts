/**
 * POST /api/internal/events/[id]/context/generate
 * Generates a deterministic context draft and upserts it into event_context.
 * Admin/Reviewer only. No LLM. Uses shared generateEventContextDraft().
 */

import { NextRequest, NextResponse } from "next/server";
import { uuidSchema } from "../../../../../_lib/validation";
import { supabaseAdmin } from "../../../../../_lib/db";
import { requireReviewer } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import {
  badRequest,
  notFound,
  internalError,
  responseFromThrown,
} from "@/lib/apiError";
import { generateEventContextDraft } from "@/lib/context/generateEventContextDraft";

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
    .select("id, status")
    .eq("id", id)
    .single();

  if (eventError || !event) {
    log.warn("Event not found", { eventId: id });
    return notFound("Event not found");
  }

  const status = (event as { status?: string }).status;
  if (status !== "Published" && status !== "UnderReview") {
    return badRequest("Event must be Published or UnderReview to generate context");
  }

  const result = await generateEventContextDraft(id, {
    skipIfApproved: true,
    skipIfRecentDraftMinutes: 10,
  });

  if (!result.ok) {
    if (result.error === "Event not found") return notFound("Event not found");
    if (result.error === "Event lacks enough data to generate a useful draft") {
      return badRequest(result.error);
    }
    log.error("Context generation failed", { eventId: id, error: result.error });
    return internalError(result.error);
  }

  if (result.generated) {
    log.info("Context generated (deterministic)", { eventId: id });
    return NextResponse.json(
      {
        ...result.built,
        status: "Draft",
        updated_at: new Date().toISOString(),
      },
      { status: 200 }
    );
  }

  log.info("Context generation skipped", { eventId: id, reason: result.reason });
  return NextResponse.json(
    {
      skipped: true,
      reason: result.reason,
      status: "Draft",
    },
    { status: 200 }
  );
}
