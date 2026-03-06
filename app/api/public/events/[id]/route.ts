import { supabaseAdmin } from "../../../_lib/db";
import { createRequestLogger } from "../../../../../lib/logger";
import { notFound, internalError } from "../../../../../lib/apiError";
import { uuidSchema } from "@/app/api/_lib/validation";
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_EVENT_COLUMNS =
  "id,title,summary,details,category,subtype,primary_classification,secondary_classification,severity,confidence_level,occurred_at,ended_at,primary_location,created_at,updated_at,context_background,key_parties,competing_claims";

/**
 * GET /api/public/events/[id]
 * Returns a single published event by id. 404 if not found or not Published.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const params = await context.params;
  const idResult = uuidSchema.safeParse(params?.id);
  if (!idResult.success) {
    return notFound("Event not found");
  }
  const id = idResult.data;

  const log = createRequestLogger({ requestId });

  const { data, error } = await supabaseAdmin
    .from("events")
    .select(PUBLIC_EVENT_COLUMNS)
    .eq("id", id)
    .eq("status", "Published")
    .maybeSingle();

  if (error) {
    log.error("Public event by id failed", { error: error.message, eventId: id });
    return internalError(error.message);
  }

  if (!data) {
    return notFound("Event not found");
  }

  return NextResponse.json(data);
}
