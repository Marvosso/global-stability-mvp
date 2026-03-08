/**
 * Shared helper to generate a Draft context analysis for an event.
 * Used by: POST /api/internal/events/[id]/context/generate and on event publish.
 * Never throws; returns a result object so callers can handle skip/failure without failing the parent action.
 */

import { supabaseAdmin } from "@/app/api/_lib/db";
import {
  buildEventContext,
  type EventForContext,
  type RelatedSource,
  type NearbyEvent,
  type BuiltEventContext,
} from "@/lib/context/buildEventContext";

const NEARBY_DAYS = 7;
const NEARBY_LIMIT = 40;
const RECENT_DRAFT_MINUTES = 10;

export type GenerateEventContextDraftOptions = {
  /** Skip if event_context.status is Approved (default true). */
  skipIfApproved?: boolean;
  /** Skip if Draft was updated within this many minutes (default 10). */
  skipIfRecentDraftMinutes?: number;
};

export type GenerateEventContextDraftResult =
  | { ok: true; generated: true; built: BuiltEventContext }
  | { ok: true; generated: false; skipped: true; reason: string }
  | { ok: false; error: string };

/**
 * Load event, sources, and nearby events; build context; upsert event_context as Draft.
 * Does not overwrite Approved context. Skips if Draft was updated recently (configurable).
 * Returns a result object; does not throw.
 */
export async function generateEventContextDraft(
  eventId: string,
  options: GenerateEventContextDraftOptions = {}
): Promise<GenerateEventContextDraftResult> {
  const skipIfApproved = options.skipIfApproved !== false;
  const recentMinutes = options.skipIfRecentDraftMinutes ?? RECENT_DRAFT_MINUTES;

  try {
    const { data: event, error: eventError } = await supabaseAdmin
      .from("events")
      .select("id, title, summary, category, subtype, severity, confidence_level, primary_location, country_code, occurred_at, status")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      return { ok: false, error: "Event not found" };
    }

    const title = (event.title ?? "").trim();
    const category = (event.category ?? "").trim();
    if (!title && !category) {
      return { ok: false, error: "Event lacks enough data to generate a useful draft" };
    }

    if (skipIfApproved) {
      const { data: existing } = await supabaseAdmin
        .from("event_context")
        .select("status, updated_at")
        .eq("event_id", eventId)
        .maybeSingle();

      if (existing?.status === "Approved") {
        return { ok: true, generated: false, skipped: true, reason: "Approved context exists; not overwriting" };
      }

      if (existing?.status === "Draft" && existing?.updated_at) {
        const updatedAt = new Date(existing.updated_at).getTime();
        const cutoff = Date.now() - recentMinutes * 60 * 1000;
        if (updatedAt >= cutoff) {
          return { ok: true, generated: false, skipped: true, reason: `Draft updated within last ${recentMinutes} minutes` };
        }
      }
    }

    const { data: sourcesData, error: sourcesError } = await supabaseAdmin
      .from("event_sources")
      .select("source_id, claim_url, raw_excerpt, sources(id, name)")
      .eq("event_id", eventId);

    if (sourcesError) {
      return { ok: false, error: sourcesError.message };
    }

    const relatedSources: RelatedSource[] = (sourcesData ?? []).map((row: Record<string, unknown>) => {
      const src = (row.sources ?? {}) as Record<string, unknown>;
      return {
        id: String(src.id ?? row.source_id ?? crypto.randomUUID()),
        name: (src.name as string) ?? null,
        raw_excerpt: (row.raw_excerpt as string) ?? null,
      };
    });

    const countryCode = (event.country_code ?? "").trim() || null;
    let nearbyEvents: NearbyEvent[] = [];

    if (countryCode) {
      const since = new Date();
      since.setDate(since.getDate() - NEARBY_DAYS);
      const sinceIso = since.toISOString();

      const { data: nearby, error: nearbyError } = await supabaseAdmin
        .from("events")
        .select("id, title, category, subtype, occurred_at, country_code")
        .eq("country_code", countryCode)
        .gte("occurred_at", sinceIso)
        .neq("id", eventId)
        .in("status", ["Published", "UnderReview"])
        .order("occurred_at", { ascending: false })
        .limit(NEARBY_LIMIT);

      if (!nearbyError && nearby?.length) {
        nearbyEvents = nearby.map((e: Record<string, unknown>) => ({
          id: String(e.id),
          title: (e.title as string) ?? null,
          category: (e.category as string) ?? null,
          subtype: (e.subtype as string) ?? null,
          occurred_at: (e.occurred_at as string) ?? null,
          country_code: (e.country_code as string) ?? null,
        }));
      }
    }

    const eventForContext: EventForContext = {
      id: event.id,
      title: event.title ?? null,
      category: event.category ?? null,
      subtype: event.subtype ?? null,
      severity: event.severity ?? null,
      confidence_level: event.confidence_level ?? null,
      primary_location: event.primary_location ?? null,
      country_code: event.country_code ?? null,
      occurred_at: event.occurred_at ?? null,
    };

    const built = buildEventContext(eventForContext, relatedSources, nearbyEvents);

    const updatedAt = new Date().toISOString();
    const { error: upsertError } = await supabaseAdmin.from("event_context").upsert(
      {
        event_id: eventId,
        summary: built.summary,
        why_it_matters: built.why_it_matters,
        likely_driver: built.likely_driver,
        uncertainty_note: built.uncertainty_note,
        generated_by: "deterministic-v1",
        status: "Draft",
        updated_at: updatedAt,
      },
      { onConflict: "event_id" }
    );

    if (upsertError) {
      return { ok: false, error: upsertError.message };
    }

    return { ok: true, generated: true, built };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
