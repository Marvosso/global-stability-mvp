/**
 * POST /api/internal/events/[id]/context/rebuild
 * Rebuild event context from event + sources (template-based). Admin/Reviewer only.
 * Writes to event_context and returns the built context.
 */

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
import { buildContext, type EventForContext, type SourceForContext } from "@/lib/context/buildContext";
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
    .select("*")
    .eq("id", id)
    .single();

  if (eventError || !event) {
    log.warn("Event not found", { eventId: id });
    return notFound("Event not found");
  }

  const { data: sourcesData, error: sourcesError } = await supabaseAdmin
    .from("event_sources")
    .select(
      "source_id, claim_url, raw_excerpt, source_confidence_level, sources(id, name, url, reliability_tier)"
    )
    .eq("event_id", id);

  if (sourcesError) {
    log.error("Event sources query failed", {
      error: sourcesError.message,
      eventId: id,
    });
    return internalError(sourcesError.message);
  }

  const eventForContext: EventForContext = {
    id: event.id,
    title: event.title ?? null,
    summary: event.summary ?? null,
    category: event.category ?? null,
    severity: event.severity ?? null,
    occurred_at: event.occurred_at ?? null,
    primary_location: event.primary_location ?? null,
    country_code: event.country_code ?? null,
  };

  const sourcesForContext: SourceForContext[] = (sourcesData ?? []).map(
    (row: Record<string, unknown>) => {
      const src = (row.sources ?? {}) as Record<string, unknown>;
      return {
        id: String(src.id ?? row.source_id ?? crypto.randomUUID()),
        name: (src.name as string) ?? null,
        url: (src.url as string) ?? null,
        claim_url: (row.claim_url as string) ?? null,
        raw_excerpt: (row.raw_excerpt as string) ?? null,
        source_confidence_level: (row.source_confidence_level as string) ?? null,
        reliability_tier: (src.reliability_tier as string) ?? null,
      };
    }
  );

  const built = buildContext(eventForContext, sourcesForContext);

  const { error: upsertError } = await supabaseAdmin.from("event_context").upsert(
    {
      event_id: id,
      one_paragraph_summary: built.one_paragraph_summary,
      trigger: built.trigger,
      background: built.background,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id" }
  );

  if (upsertError) {
    log.error("event_context upsert failed", {
      error: upsertError.message,
      eventId: id,
    });
    return internalError(upsertError.message);
  }

  log.info("Event context rebuilt", { eventId: id });
  return NextResponse.json(built);
}
