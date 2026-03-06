/**
 * GET /api/internal/events/[id]/briefing
 * Returns the briefing for an event (Draft or Approved). Reviewer/Admin only.
 */

import { uuidSchema } from "../../../../_lib/validation";
import { supabaseAdmin } from "../../../../_lib/db";
import { requireReviewer } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import { badRequest, notFound, responseFromThrown } from "@/lib/apiError";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = crypto.randomUUID();
  const idResult = uuidSchema.safeParse(params?.id);
  if (!idResult.success) {
    return badRequest("Invalid event id");
  }
  const id = idResult.data;

  try {
    await requireReviewer(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    throw err;
  }

  const log = createRequestLogger({ requestId });

  const { data: event } = await supabaseAdmin
    .from("events")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (!event) {
    log.warn("Event not found", { eventId: id });
    return notFound("Event not found");
  }

  const { data: briefing, error } = await supabaseAdmin
    .from("event_briefings")
    .select("brief_json, version, generated_at, status")
    .eq("event_id", id)
    .maybeSingle();

  if (error) {
    log.error("Briefing fetch failed", { eventId: id, error: error.message });
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    briefing: briefing
      ? {
          brief_json: briefing.brief_json,
          version: briefing.version,
          generated_at: briefing.generated_at,
          status: briefing.status,
        }
      : null,
  });
}
