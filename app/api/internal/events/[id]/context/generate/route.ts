/**
 * POST /api/internal/events/[id]/context/generate
 * Generates an AI context draft from event + sources and stores it in event_context_drafts.
 * Does not overwrite event_context. Admin/Reviewer only.
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
import { generateContextDraft } from "@/lib/ai/contextDraft";

const TOP_EXCERPTS = 5;

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
    .select("id, title, summary, category, primary_location, occurred_at")
    .eq("id", id)
    .single();

  if (eventError || !event) {
    log.warn("Event not found", { eventId: id });
    return notFound("Event not found");
  }

  const { data: sourcesData, error: sourcesError } = await supabaseAdmin
    .from("event_sources")
    .select(
      "raw_excerpt, sources(id, name)"
    )
    .eq("event_id", id);

  if (sourcesError) {
    log.error("Event sources query failed", { error: sourcesError.message, eventId: id });
    return internalError(sourcesError.message);
  }

  const excerpts: string[] = [];
  for (const row of sourcesData ?? []) {
    const r = row as unknown as { raw_excerpt?: string | null; sources?: { id: string; name: string | null } | { id: string; name: string | null }[] | null };
    const src = Array.isArray(r.sources) ? r.sources[0] : r.sources;
    const name = src?.name?.trim() || "A source";
    const raw = r.raw_excerpt?.trim();
    if (raw) {
      excerpts.push(`[${name}]: ${raw.slice(0, 500)}`);
    } else {
      excerpts.push(`[${name}]: cited this event.`);
    }
    if (excerpts.length >= TOP_EXCERPTS) break;
  }

  const input = {
    title: (event.title ?? "").trim() || "Event",
    summary: (event.summary ?? "").trim() || "",
    sourceExcerpts: excerpts,
    category: (event.category ?? "").trim() || "Uncategorized",
    location: event.primary_location ?? null,
    occurred_at: event.occurred_at ?? null,
  };

  let draftOutput: { draft: { summary: string; trigger: string | null; background: string; uncertainties: string | null }; model: string };
  try {
    draftOutput = await generateContextDraft(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Context draft generation failed";
    log.error("generateContextDraft failed", { eventId: id, message });
    return internalError(message);
  }

  const { draft, model } = draftOutput;

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("event_context_drafts")
    .insert({
      event_id: id,
      draft_summary: draft.summary,
      draft_trigger: draft.trigger,
      draft_background: draft.background,
      model,
    })
    .select("id, event_id, draft_summary, draft_trigger, draft_background, model, created_at")
    .single();

  if (insertError) {
    log.error("event_context_drafts insert failed", { error: insertError.message, eventId: id });
    return internalError(insertError.message);
  }

  log.info("Context draft generated", { eventId: id, draftId: inserted?.id });

  return NextResponse.json(
    {
      ...inserted,
      uncertainties: draft.uncertainties,
    },
    { status: 201 }
  );
}
