import { supabaseAdmin } from "./db";
import { calculateConfidence, type EventForConfidence, type EventSourceForConfidence } from "@/lib/confidence";

type EventSourceRow = {
  source_primary_classification?: string | null;
  source_secondary_classification?: string | null;
  sources: {
    reliability_tier: string | null;
    ecosystem_key?: string | null;
    accuracy_score?: number | null;
    corroboration_rate?: number | null;
    citation_count?: number | null;
  } | null;
};

type EventRow = {
  id: string;
  status?: string;
  primary_classification?: string | null;
  secondary_classification?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  event_sources?: EventSourceRow[] | null;
};

const SELECT =
  "id, status, primary_classification, secondary_classification, occurred_at, created_at, event_sources(source_primary_classification, source_secondary_classification, sources(reliability_tier, ecosystem_key, accuracy_score, corroboration_rate, citation_count))";

/**
 * Load event with sources, recalculate confidence, and persist if event is not Published.
 * Used by POST /api/internal/confidence/[id] and after attaching sources in createDraftEvent.
 *
 * @returns result with updated score/level, or reason why no update was performed
 */
export async function recalculateEventConfidence(
  eventId: string,
  options?: { justification?: string; changedBy?: string | null }
): Promise<
  | { updated: true; score: number; level: string }
  | { updated: false; reason: "not_found" | "published" | "update_failed" }
> {
  const { data: row, error } = await supabaseAdmin
    .from("events")
    .select(SELECT)
    .eq("id", eventId)
    .single();

  if (error || !row) return { updated: false, reason: "not_found" };

  const event = row as unknown as EventRow;
  if (event.status === "Published") return { updated: false, reason: "published" };

  const eventSources = event.event_sources ?? [];
  const sources: EventSourceForConfidence[] = eventSources.map((es) => ({
    reliability_tier: (es.sources?.reliability_tier ?? "Low") as "Low" | "Medium" | "High",
    ecosystem_key: es.sources?.ecosystem_key ?? null,
    source_primary_classification: (es.source_primary_classification ?? null) as EventSourceForConfidence["source_primary_classification"],
    source_secondary_classification: (es.source_secondary_classification ?? null) as EventSourceForConfidence["source_secondary_classification"],
    accuracy_score: es.sources?.accuracy_score ?? null,
    corroboration_rate: es.sources?.corroboration_rate ?? null,
    citation_count: es.sources?.citation_count ?? null,
  }));

  const eventForConfidence: EventForConfidence = {
    primary_classification: (event.primary_classification ?? "Disputed Claim") as "Verified Event" | "Disputed Claim",
    secondary_classification: (event.secondary_classification ?? null) as EventForConfidence["secondary_classification"],
    occurred_at: event.occurred_at ?? null,
    created_at: event.created_at ?? null,
    sources,
  };

  const { score, level } = calculateConfidence(eventForConfidence);

  const { error: updateError } = await supabaseAdmin.rpc("update_event_confidence", {
    p_event_id: eventId,
    p_confidence_score: score,
    p_confidence_level: level,
    p_justification: options?.justification ?? "System: source attached",
    p_changed_by: options?.changedBy ?? null,
  });

  if (updateError) return { updated: false, reason: "update_failed" as const };

  return { updated: true, score, level };
}
