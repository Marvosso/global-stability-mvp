import { createRequestLogger } from "@/lib/logger";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { getRegionKey } from "@/lib/regionKey";
import { buildInputs } from "./buildInputs";
import type { EventForBriefingInput, SourceForBriefingInput, NearbyEventForBriefingInput } from "./buildInputs";
import { BriefingSchema } from "./BriefingSchema";
import { generatePlaceholderBriefing } from "./placeholderGenerator";

const SKIP_IF_GENERATED_WITHIN_MINUTES = 10;
const NEARBY_LOOKBACK_HOURS = 72;

/**
 * Generates a Draft briefing for a published event and upserts it into event_briefings.
 * Does not throw; logs errors. Caller should not await in a blocking way (fire-and-forget).
 */
export async function generateDraftBriefing(eventId: string): Promise<void> {
  const log = createRequestLogger({ requestId: `briefing-${eventId}` });

  try {
    log.info("briefing_generation_started", { eventId });

    const { data: existing } = await supabaseAdmin
      .from("event_briefings")
      .select("generated_at")
      .eq("event_id", eventId)
      .maybeSingle();

    if (existing?.generated_at) {
      const cutoff = new Date(Date.now() - SKIP_IF_GENERATED_WITHIN_MINUTES * 60 * 1000);
      if (new Date(existing.generated_at) >= cutoff) {
        log.info("briefing_generation_skipped_recent", { eventId });
        return;
      }
    }

    const { data: event, error: eventError } = await supabaseAdmin
      .from("events")
      .select("id, title, summary, category, primary_location, country_code, severity, occurred_at")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      log.warn("briefing_generation_failed", { eventId, message: eventError?.message ?? "Event not found" });
      return;
    }

    const { data: sourcesData, error: sourcesError } = await supabaseAdmin
      .from("event_sources")
      .select("source_id, sources(id, name, url, source_type, reliability_tier)")
      .eq("event_id", eventId);

    if (sourcesError) {
      log.warn("briefing_generation_failed", { eventId, message: sourcesError.message });
      return;
    }

    const sourcesMapped = (sourcesData ?? []).map(
      (row: { source_id: string; sources: unknown }) => {
        const s = row.sources as { id: string; name?: string | null; url?: string | null; source_type?: string | null; reliability_tier?: string | null } | null;
        return s ? { id: s.id, name: s.name ?? null, url: s.url ?? null, source_type: s.source_type ?? null, reliability_tier: s.reliability_tier ?? null } : null;
      }
    );
    const sources: SourceForBriefingInput[] = sourcesMapped.filter((s) => s !== null) as SourceForBriefingInput[];

    const since = new Date(Date.now() - NEARBY_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
    const { data: recentRows, error: recentError } = await supabaseAdmin
      .from("events")
      .select("id, title, occurred_at, created_at, country_code, primary_location, category")
      .eq("status", "Published")
      .neq("id", eventId)
      .or(`occurred_at.gte.${since},created_at.gte.${since}`);

    if (recentError) {
      log.warn("briefing_generation_failed", { eventId, message: recentError.message });
      return;
    }

    const eventRegionKey = getRegionKey(
      (event as { country_code?: string | null }).country_code,
      (event as { primary_location?: string | null }).primary_location
    );

    const nearbyEvents: NearbyEventForBriefingInput[] = (recentRows ?? [])
      .filter((e: { country_code?: string | null; primary_location?: string | null }) => {
        const key = getRegionKey(e.country_code, e.primary_location);
        return key === eventRegionKey && key !== "unknown";
      })
      .map((e: { id: string; title: string | null; occurred_at: string | null; created_at: string; category?: string | null }) => ({
        id: e.id,
        title: e.title ?? null,
        occurred_at: e.occurred_at ?? null,
        created_at: e.created_at,
        category: e.category ?? null,
      }));

    const inputs = buildInputs(event as EventForBriefingInput, sources, nearbyEvents);
    const raw = generatePlaceholderBriefing(inputs);
    const parsed = BriefingSchema.safeParse(raw);
    if (!parsed.success) {
      log.error("briefing_generation_failed", { eventId, reason: "validation", message: parsed.error.message });
      return;
    }
    const briefJson = parsed.data;

    const { data: currentRow } = await supabaseAdmin
      .from("event_briefings")
      .select("version")
      .eq("event_id", eventId)
      .maybeSingle();

    const nextVersion = ((currentRow?.version as number) ?? 0) + 1;

    const { error: upsertError } = await supabaseAdmin
      .from("event_briefings")
      .upsert(
        {
          event_id: eventId,
          brief_json: briefJson,
          version: nextVersion,
          generated_at: new Date().toISOString(),
          status: "Draft",
        },
        { onConflict: "event_id" }
      );

    if (upsertError) {
      log.error("briefing_generation_failed", { eventId, message: upsertError.message });
      return;
    }

    log.info("briefing_generation_completed", { eventId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("briefing_generation_failed", { eventId, message });
  }
}
