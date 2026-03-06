import type { CreateDraftEventData } from "./validation";
import { supabaseAdmin } from "./db";
import { getOrCreateSourceByDomain } from "./getOrCreateSourceByDomain";
import { recalculateEventConfidence } from "./recalculateEventConfidence";
import { normalizeDomainFromUrl } from "@/lib/domain";
import { statusFromSupabaseError } from "@/lib/apiError";
import { parsePrimaryLocation, distanceKm } from "@/lib/eventCoordinates";
import { reverseGeocode } from "@/lib/geocode/reverseGeocode";

export type CreateDraftEventParams = {
  data: CreateDraftEventData;
  createdBy: string | null;
};

export type CreateDraftEventResult = { event: { id: string; [key: string]: unknown } };

/** Thrown with .status when validation or insert fails. */
export class CreateDraftEventError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CreateDraftEventError";
    this.status = status;
  }
}

const DEDUP_DISTANCE_KM = 100;
const DEDUP_WINDOW_HOURS = 12;
const DEDUP_QUERY_LIMIT = 50;

/**
 * Link source_url to an event: trusted domain → getOrCreateSourceByDomain + event_sources;
 * else existing source by domain → event_sources; else create source_candidate.
 * Used after creating a new event and when merging into an existing event (dedup).
 */
export async function linkSourceUrlToEvent(
  eventId: string,
  data: CreateDraftEventData
): Promise<void> {
  if (!data.source_url?.trim()) return;

  const urlTrimmed = data.source_url.trim();
  const normalizedDomain = normalizeDomainFromUrl(urlTrimmed);

  if (normalizedDomain) {
    try {
      const { data: trusted } = await supabaseAdmin
        .from("trusted_domains")
        .select("domain, default_reliability_tier")
        .eq("domain", normalizedDomain)
        .eq("is_enabled", true)
        .maybeSingle();

      if (trusted) {
        const canonicalUrl = `https://${normalizedDomain}`;
        const source = await getOrCreateSourceByDomain(normalizedDomain, {
          name: normalizedDomain,
          url: canonicalUrl,
          reliability_tier: trusted.default_reliability_tier,
          ecosystem_key: null,
          source_type: "Other",
        });

        if (source) {
          try {
            await supabaseAdmin.from("event_sources").insert({
              event_id: eventId,
              source_id: source.id,
              claim_url: urlTrimmed,
            });
            await supabaseAdmin.rpc("increment_source_citation_count", { p_source_id: source.id });
          } catch (insertErr: unknown) {
            const code = (insertErr as { code?: string })?.code;
            if (code === "23505") return; // already linked
            throw insertErr;
          }

          await supabaseAdmin
            .from("source_candidates")
            .update({
              status: "Approved",
              promoted_to_source_id: source.id,
            })
            .eq("domain", normalizedDomain)
            .eq("status", "Pending");

          console.log(
            "[trusted-domains] auto-promoted source",
            JSON.stringify({
              domain: normalizedDomain,
              default_reliability_tier: trusted.default_reliability_tier,
            })
          );
          return;
        }
      }
    } catch (err) {
      console.error("[trusted-domains] lookup failed", err);
    }
  }

  try {
    const parsedUrl = new URL(urlTrimmed);

    if (normalizedDomain) {
      const { data: sourceByDomain } = await supabaseAdmin
        .from("sources")
        .select("id")
        .eq("domain", normalizedDomain)
        .maybeSingle();

      if (sourceByDomain) {
        try {
          await supabaseAdmin.from("event_sources").insert({
            event_id: eventId,
            source_id: sourceByDomain.id,
            claim_url: urlTrimmed,
          });
          await supabaseAdmin.rpc("increment_source_citation_count", { p_source_id: sourceByDomain.id });
        } catch (insertErr: unknown) {
          const code = (insertErr as { code?: string })?.code;
          if (code === "23505") return;
          throw insertErr;
        }
        return;
      }
    }

    const evidenceExcerpt =
      [data.summary, data.title].filter(Boolean).join(" — ").slice(0, 2000) ||
      null;

    if (normalizedDomain) {
      const canonicalDomainUrl = `https://${normalizedDomain}`;
      const { data: existingDomainCandidate } = await supabaseAdmin
        .from("source_candidates")
        .select("id")
        .eq("domain", normalizedDomain)
        .eq("url", canonicalDomainUrl)
        .eq("status", "Pending")
        .maybeSingle();

      if (!existingDomainCandidate) {
        const { error: insertErr } = await supabaseAdmin
          .from("source_candidates")
          .insert({
            url: canonicalDomainUrl,
            domain: normalizedDomain,
            name_guess: normalizedDomain,
            suggested_reliability_tier: null,
            suggested_ecosystem: null,
            evidence_excerpt: evidenceExcerpt,
            discovered_from_event_id: eventId,
            status: "Pending",
          });
        if (insertErr?.code === "23505") {
          // already exists
        } else if (insertErr) {
          console.error("[createDraftEvent] source_candidates insert failed", insertErr);
        }
      }
    } else {
      const { data: existingSource } = await supabaseAdmin
        .from("sources")
        .select("id")
        .eq("url", urlTrimmed)
        .maybeSingle();

      if (!existingSource) {
        const { data: pendingCandidate } = await supabaseAdmin
          .from("source_candidates")
          .select("id")
          .eq("url", urlTrimmed)
          .eq("status", "Pending")
          .maybeSingle();

        if (!pendingCandidate) {
          await supabaseAdmin.from("source_candidates").insert({
            url: urlTrimmed,
            domain: null,
            name_guess: parsedUrl.hostname.toLowerCase(),
            suggested_reliability_tier: null,
            suggested_ecosystem: null,
            evidence_excerpt: evidenceExcerpt,
            discovered_from_event_id: eventId,
            status: "Pending",
          });
        }
      }
    }
  } catch {
    // invalid URL or other; skip candidate
  }
}

type EventRow = { id: string; primary_location: string | null; occurred_at: string | null };

/**
 * Find an existing event that is a duplicate of the given draft data:
 * same category, occurred_at within ±12h, and primary_location within 100 km.
 * Returns first match or null.
 */
async function findDuplicateEvent(data: CreateDraftEventData): Promise<{ id: string } | null> {
  const newCoords = parsePrimaryLocation(data.primary_location);
  if (!newCoords) return null;

  const newTime = data.occurred_at && !Number.isNaN(new Date(data.occurred_at).getTime())
    ? new Date(data.occurred_at)
    : new Date();
  const windowMs = DEDUP_WINDOW_HOURS * 60 * 60 * 1000;
  const windowStart = new Date(newTime.getTime() - windowMs).toISOString();
  const windowEnd = new Date(newTime.getTime() + windowMs).toISOString();

  const { data: rows, error } = await supabaseAdmin
    .from("events")
    .select("id, primary_location, occurred_at")
    .eq("category", data.category)
    .in("status", ["UnderReview", "Published"])
    .not("primary_location", "is", null)
    .not("occurred_at", "is", null)
    .gte("occurred_at", windowStart)
    .lte("occurred_at", windowEnd)
    .limit(DEDUP_QUERY_LIMIT);

  if (error || !rows?.length) return null;

  for (const row of rows as EventRow[]) {
    const existingCoords = parsePrimaryLocation(row.primary_location);
    if (!existingCoords) continue;
    const km = distanceKm(
      newCoords.lat,
      newCoords.lng,
      existingCoords.lat,
      existingCoords.lng
    );
    if (km < DEDUP_DISTANCE_KM) return { id: row.id };
  }

  return null;
}

/**
 * Insert draft event (status UnderReview), optional event_actors/event_sources,
 * and optional source_candidate from source_url. Caller must have already
 * validated body with createDraftEventSchema.
 */
export async function createDraftEventAndMaybeCandidate(
  params: CreateDraftEventParams
): Promise<CreateDraftEventResult> {
  const { data, createdBy } = params;

  if (data.actors?.length) {
    const requestedActorIds = [...new Set(data.actors.map((a) => a.actor_id))];
    const { data: existingActors, error: actorErr } = await supabaseAdmin
      .from("actors")
      .select("id")
      .in("id", requestedActorIds);
    if (actorErr) {
      throw new CreateDraftEventError("Failed to verify actors", 500);
    }
    const foundActorIds = new Set((existingActors ?? []).map((r) => r.id));
    const missingActorIds = requestedActorIds.filter((id) => !foundActorIds.has(id));
    if (missingActorIds.length > 0) {
      throw new CreateDraftEventError(
        `The following actor IDs do not exist: ${missingActorIds.join(", ")}`,
        400
      );
    }
  }

  if (data.sources?.length) {
    const requestedSourceIds = [...new Set(data.sources.map((s) => s.source_id))];
    const { data: existingSources, error: sourceErr } = await supabaseAdmin
      .from("sources")
      .select("id")
      .in("id", requestedSourceIds);
    if (sourceErr) {
      throw new CreateDraftEventError("Failed to verify sources", 500);
    }
    const foundSourceIds = new Set((existingSources ?? []).map((r) => r.id));
    const missingSourceIds = requestedSourceIds.filter((id) => !foundSourceIds.has(id));
    if (missingSourceIds.length > 0) {
      throw new CreateDraftEventError(
        `The following source IDs do not exist: ${missingSourceIds.join(", ")}`,
        400
      );
    }
  }

  // Event deduplication: same category, within 12h, within 100 km → attach source to existing event.
  if (parsePrimaryLocation(data.primary_location)) {
    const existing = await findDuplicateEvent(data);
    if (existing) {
      await linkSourceUrlToEvent(existing.id, data);
      await recalculateEventConfidence(existing.id);
      return { event: { id: existing.id } };
    }
  }

  let country_code: string | null = null;
  let admin1: string | null = null;
  const coords = parsePrimaryLocation(data.primary_location);
  if (coords) {
    try {
      const geo = await reverseGeocode(coords.lng, coords.lat);
      country_code = geo.country_code ?? null;
      admin1 = geo.admin1 ?? null;
    } catch {
      // Do not block event creation on geocode failure
    }
  }

  const eventRow = {
    title: data.title,
    summary: data.summary,
    details: data.details ?? null,
    category: data.category,
    subtype: data.subtype ?? null,
    primary_classification: data.primary_classification,
    secondary_classification: data.secondary_classification ?? null,
    severity: data.severity,
    confidence_level: data.confidence_level,
    confidence_score: data.confidence_score ?? null,
    status: "UnderReview" as const,
    created_by: createdBy,
    requires_dual_review: data.requires_dual_review ?? false,
    occurred_at: data.occurred_at ?? null,
    ended_at: data.ended_at ?? null,
    primary_location: data.primary_location ?? null,
    country_code,
    admin1,
  };

  const { data: event, error: insertError } = await supabaseAdmin
    .from("events")
    .insert(eventRow)
    .select()
    .single();

  if (insertError) {
    const status = statusFromSupabaseError(insertError.code);
    throw new CreateDraftEventError(insertError.message, status);
  }

  if (data.actors?.length) {
    await supabaseAdmin.from("event_actors").insert(
      data.actors.map((a) => ({
        event_id: event.id,
        actor_id: a.actor_id,
        role: a.role,
        is_primary: a.is_primary ?? false,
        notes: a.notes ?? null,
      }))
    );
  }

  if (data.sources?.length) {
    await supabaseAdmin.from("event_sources").insert(
      data.sources.map((s) => ({
        event_id: event.id,
        source_id: s.source_id,
        claim_url: s.claim_url ?? null,
        claim_timestamp: s.claim_timestamp ?? null,
        source_primary_classification: s.source_primary_classification ?? null,
        source_secondary_classification: s.source_secondary_classification ?? null,
        source_confidence_level: s.source_confidence_level ?? null,
        raw_excerpt: s.raw_excerpt ?? null,
      }))
    );
    for (const s of data.sources) {
      await supabaseAdmin.rpc("increment_source_citation_count", { p_source_id: s.source_id });
    }
  }

  await linkSourceUrlToEvent(event.id, data);

  await recalculateEventConfidence(event.id);

  return { event };
}
