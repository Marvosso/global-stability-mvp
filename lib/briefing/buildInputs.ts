/**
 * Builds a single input object for briefing generation (placeholder or future LLM).
 */

export type EventForBriefingInput = {
  id: string;
  title: string | null;
  summary: string | null;
  category: string;
  primary_location: string | null;
  country_code: string | null;
  severity?: string | null;
  occurred_at?: string | null;
};

export type SourceForBriefingInput = {
  id: string;
  name: string | null;
  url: string | null;
  source_type?: string | null;
  reliability_tier?: string | null;
};

export type NearbyEventForBriefingInput = {
  id: string;
  title: string | null;
  occurred_at: string | null;
  created_at: string;
  category?: string | null;
};

export type BriefingInput = {
  event: {
    id: string;
    title: string;
    summary: string;
    category: string;
    primary_location: string | null;
    country_code: string | null;
    severity: string | null;
    occurred_at: string | null;
  };
  sources: Array<{
    id: string;
    name: string;
    url: string | null;
    source_type: string | null;
    reliability_tier: string | null;
  }>;
  nearbySummaries: Array<{
    id: string;
    title: string;
    occurred_at: string | null;
    created_at: string;
    category: string | null;
  }>;
};

export function buildInputs(
  event: EventForBriefingInput,
  sources: SourceForBriefingInput[],
  nearbyEvents: NearbyEventForBriefingInput[]
): BriefingInput {
  return {
    event: {
      id: event.id,
      title: (event.title ?? "").trim() || "Untitled",
      summary: ((event.summary ?? "").trim().slice(0, 5000) || event.title) ?? "No summary",
      category: event.category ?? "",
      primary_location: event.primary_location?.trim() || null,
      country_code: event.country_code?.trim() || null,
      severity: event.severity ?? null,
      occurred_at: event.occurred_at ?? null,
    },
    sources: sources.map((s) => ({
      id: s.id,
      name: (s.name ?? "").trim() || "Unknown source",
      url: s.url?.trim() || null,
      source_type: s.source_type ?? null,
      reliability_tier: s.reliability_tier ?? null,
    })),
    nearbySummaries: nearbyEvents.slice(0, 20).map((e) => ({
      id: e.id,
      title: (e.title ?? "").trim() || "Untitled",
      occurred_at: e.occurred_at ?? null,
      created_at: e.created_at,
      category: e.category ?? null,
    })),
  };
}
