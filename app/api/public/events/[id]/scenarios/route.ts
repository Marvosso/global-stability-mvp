import { supabaseAdmin } from "../../../../_lib/db";
import { createRequestLogger } from "@/lib/logger";
import { notFound, internalError } from "@/lib/apiError";
import { uuidSchema } from "@/app/api/_lib/validation";
import { getSequenceKey } from "@/lib/scenarios/sequenceKey";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/public/events/[id]/scenarios
 * Returns possible outcomes and historical examples for a published event.
 */
export async function GET(
  _request: NextRequest,
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

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id, category, subtype, severity")
    .eq("id", id)
    .eq("status", "Published")
    .maybeSingle();

  if (eventError) {
    log.error("Scenarios event fetch failed", { error: eventError.message, eventId: id });
    return internalError(eventError.message);
  }

  if (!event) {
    return notFound("Event not found");
  }

  const row = event as { category: string; subtype: string | null; severity: string };
  const sequenceKey = getSequenceKey(row.category, row.subtype, row.severity);

  const { data: seqRows, error: seqError } = await supabaseAdmin
    .from("event_sequences")
    .select("outcome, count")
    .eq("sequence_key", sequenceKey);

  if (seqError) {
    log.error("Scenarios event_sequences fetch failed", {
      error: seqError.message,
      eventId: id,
    });
    return internalError(seqError.message);
  }

  const total = (seqRows ?? []).reduce((sum, r) => sum + Number((r as { count: number }).count ?? 0), 0);
  const possible_outcomes =
    total > 0
      ? (seqRows ?? [])
          .map((r) => {
            const count = Number((r as { count: number }).count ?? 0);
            return {
              name: (r as { outcome: string }).outcome,
              probability: Math.round((count / total) * 100) / 100,
            };
          })
          .sort((a, b) => b.probability - a.probability)
      : [];

  let examplesQuery = supabaseAdmin
    .from("events")
    .select("id, title, outcome, occurred_at")
    .eq("status", "Published")
    .eq("category", row.category)
    .eq("severity", row.severity)
    .neq("id", id)
    .not("outcome", "is", null)
    .limit(10);
  if (row.subtype != null && row.subtype !== "") {
    examplesQuery = examplesQuery.eq("subtype", row.subtype);
  } else {
    examplesQuery = examplesQuery.is("subtype", null);
  }
  const { data: examples } = await examplesQuery;

  const historical_examples = (examples ?? []).map((e) => {
    const ev = e as { id: string; title: string | null; outcome: string; occurred_at: string | null };
    return {
      event_id: ev.id,
      title: ev.title?.trim() ?? "Untitled",
      outcome: ev.outcome,
      occurred_at: ev.occurred_at,
    };
  });

  return NextResponse.json({
    possible_outcomes,
    historical_examples,
  });
}
