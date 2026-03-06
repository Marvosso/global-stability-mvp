/**
 * Weighted similarity scoring for incident clustering.
 * Replaces hard-rule matching with configurable weights and thresholds.
 */

import { parsePrimaryLocation, distanceKm } from "@/lib/eventCoordinates";

/** New event data used for matching. */
export type NewEvent = {
  title: string;
  category: string;
  subtype?: string | null;
  primary_location?: string | null;
  occurred_at?: string | null;
};

/** Candidate incident from DB (primary_location as "lat,lng" text). */
export type CandidateIncident = {
  id: string;
  title: string | null;
  category: string | null;
  subtype?: string | null;
  primary_location: string | null;
  occurred_at: string | null;
  event_count?: number;
};

export type MatchResult = {
  incidentId: string | null;
  matchScore: number;
  /** When score 0.50–0.74: best matching incident for suggested_incident_id. */
  suggestedIncidentId?: string | null;
};

const WEIGHT_TIME = 0.3;
const WEIGHT_DISTANCE = 0.3;
const WEIGHT_CATEGORY = 0.2;
const WEIGHT_TITLE = 0.15;
const WEIGHT_SOURCE = 0.05;

const THRESHOLD_AUTO_ATTACH = 0.75;
const THRESHOLD_FLAG = 0.5;

/** Natural Disaster subtype groups for "related" scoring. */
const NATURAL_DISASTER_GROUPS: string[][] = [
  ["Earthquake"],
  ["Flood", "Cyclone"],
  ["Drought", "Wildfire"],
];

const STOPWORDS = new Set([
  "the", "a", "an", "of", "in", "on", "at", "to", "for", "is", "are", "was", "were",
]);

function normalizeTitle(title: string | null | undefined): string[] {
  if (!title?.trim()) return [];
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/** Jaccard-like token overlap: |A ∩ B| / |A ∪ B|. Returns 0–1. */
function titleSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

type CategoryTuning = { timeScale: number; distanceScale: number };

function getCategoryTuning(category: string, subtype?: string | null): CategoryTuning {
  const sub = (subtype ?? "").toLowerCase();
  if (category === "Natural Disaster") {
    if (sub === "earthquake") return { timeScale: 1.5, distanceScale: 1.5 };
    if (sub === "wildfire") return { timeScale: 1, distanceScale: 1.5 };
  }
  if (category === "Political Tension" && sub === "protest") {
    return { timeScale: 1, distanceScale: 0.5 };
  }
  return { timeScale: 1, distanceScale: 1 };
}

function computeTimeScore(
  eventTime: number,
  incidentTime: number,
  tuning: CategoryTuning
): number {
  const diffHours = Math.abs(eventTime - incidentTime) / (60 * 60 * 1000);
  const scaled = diffHours / tuning.timeScale;
  if (scaled <= 1) return 1;
  if (scaled <= 6) return 0.8;
  if (scaled <= 12) return 0.5;
  if (scaled <= 24) return 0.2;
  return 0;
}

function computeDistanceScore(km: number, tuning: CategoryTuning): number {
  const scaled = km / tuning.distanceScale;
  if (scaled <= 10) return 1;
  if (scaled <= 50) return 0.8;
  if (scaled <= 100) return 0.5;
  if (scaled <= 250) return 0.2;
  return 0;
}

function computeCategoryScore(
  eventCat: string,
  eventSub: string | null | undefined,
  incCat: string | null,
  incSub: string | null | undefined
): number {
  if (!incCat || eventCat !== incCat) return 0;
  const es = (eventSub ?? "").trim();
  const is_ = (incSub ?? "").trim();
  if (es && is_ && es === is_) return 1;
  if (eventCat === "Natural Disaster" && es && is_) {
    const eventGroupIdx = NATURAL_DISASTER_GROUPS.findIndex((g) =>
      g.some((s) => s.toLowerCase() === es.toLowerCase())
    );
    const incGroupIdx = NATURAL_DISASTER_GROUPS.findIndex((g) =>
      g.some((s) => s.toLowerCase() === is_.toLowerCase())
    );
    if (eventGroupIdx >= 0 && incGroupIdx >= 0 && eventGroupIdx === incGroupIdx) return 0.7;
  }
  if (es || is_) return 0.5;
  return 0.5;
}

function computeSourceScore(eventCount: number): number {
  return eventCount >= 2 ? 1 : 0;
}

/**
 * Find best matching incident using weighted similarity scoring.
 * Returns incidentId when score >= 0.75; otherwise null with suggestedIncidentId when 0.50–0.74.
 */
export function matchIncident(
  newEvent: NewEvent,
  candidates: CandidateIncident[]
): MatchResult {
  const coords = parsePrimaryLocation(newEvent.primary_location);
  const eventTime = newEvent.occurred_at && !Number.isNaN(new Date(newEvent.occurred_at).getTime())
    ? new Date(newEvent.occurred_at).getTime()
    : null;
  const eventTokens = normalizeTitle(newEvent.title);
  const tuning = getCategoryTuning(newEvent.category, newEvent.subtype);

  let bestScore = 0;
  let bestId: string | null = null;

  for (const c of candidates) {
    let timeScore = 0;
    if (eventTime && c.occurred_at) {
      const incTime = new Date(c.occurred_at).getTime();
      if (Number.isFinite(incTime)) {
        timeScore = computeTimeScore(eventTime, incTime, tuning);
      }
    }

    let distanceScore = 0;
    if (coords && c.primary_location) {
      const incCoords = parsePrimaryLocation(c.primary_location);
      if (incCoords) {
        const km = distanceKm(coords.lat, coords.lng, incCoords.lat, incCoords.lng);
        distanceScore = computeDistanceScore(km, tuning);
      }
    }

    const categoryScore = computeCategoryScore(
      newEvent.category,
      newEvent.subtype,
      c.category,
      c.subtype
    );

    const titleScore = titleSimilarity(eventTokens, normalizeTitle(c.title));

    const sourceScore = computeSourceScore(c.event_count ?? 0);

    const total =
      timeScore * WEIGHT_TIME +
      distanceScore * WEIGHT_DISTANCE +
      categoryScore * WEIGHT_CATEGORY +
      titleScore * WEIGHT_TITLE +
      sourceScore * WEIGHT_SOURCE;

    if (total > bestScore) {
      bestScore = total;
      bestId = c.id;
    }
  }

  if (bestScore >= THRESHOLD_AUTO_ATTACH && bestId) {
    return { incidentId: bestId, matchScore: bestScore };
  }
  if (bestScore >= THRESHOLD_FLAG && bestId) {
    return { incidentId: null, matchScore: bestScore, suggestedIncidentId: bestId };
  }
  return { incidentId: null, matchScore: bestScore };
}
