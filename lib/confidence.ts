/**
 * Deterministic confidence scoring. Pure function, no DB or I/O.
 * Implements rules from memory_package/confidence_rules.md.
 */

const TIER_WEIGHTS = { Low: 10, Medium: 25, High: 40 } as const;
const EVIDENCE_BONUS = 10;
const CONTRADICTION_PENALTY = 5;
const LEVEL_BANDS = { Low: [0, 33], Medium: [34, 66], High: [67, 100] } as const;
const DECAY_AGE_HOURS = 24;
const DECAY_FACTOR = 0.9;

export type ReliabilityTier = keyof typeof TIER_WEIGHTS;
export type ConfidenceLevel = "Low" | "Medium" | "High";

export interface EventSourceForConfidence {
  reliability_tier: ReliabilityTier;
  ecosystem_key?: string | null;
  source_primary_classification?: "Verified Event" | "Disputed Claim" | null;
  source_secondary_classification?: "Official Claim" | "Opposition Claim" | null;
  /** Source credibility: 0-100; null = use default (50). */
  accuracy_score?: number | null;
  /** Corroboration rate 0-1; null = use default (0.5). */
  corroboration_rate?: number | null;
  /** Number of times source cited on events; boosts weight slightly. */
  citation_count?: number | null;
}

export interface EventForConfidence {
  primary_classification: "Verified Event" | "Disputed Claim";
  secondary_classification?: "Official Claim" | "Opposition Claim" | null;
  occurred_at?: string | null;
  created_at?: string | null;
  sources: EventSourceForConfidence[];
}

export interface ConfidenceResult {
  score: number;
  level: ConfidenceLevel;
}

function credibilityMultiplier(s: EventSourceForConfidence): number {
  const accuracy = s.accuracy_score != null ? Math.max(0, Math.min(100, s.accuracy_score)) / 100 : 0.5;
  const corroboration = s.corroboration_rate != null ? Math.max(0, Math.min(1, s.corroboration_rate)) : 0.5;
  const citationBonus = s.citation_count != null && s.citation_count > 0 ? Math.min(0.2, s.citation_count / 100) : 0;
  return accuracy * (0.5 + 0.5 * corroboration) + citationBonus;
}

function effectiveTierWeights(sources: EventSourceForConfidence[]): number {
  const byEcosystem = new Map<string, number>();
  for (const s of sources) {
    const key = s.ecosystem_key ?? "";
    const baseW = TIER_WEIGHTS[s.reliability_tier];
    const cred = credibilityMultiplier(s);
    const w = baseW * cred;
    const existing = byEcosystem.get(key);
    if (existing === undefined || w > existing) byEcosystem.set(key, w);
  }
  let sum = 0;
  byEcosystem.forEach((w) => (sum += w));
  return sum;
}

function evidenceBonus(event: EventForConfidence, sources: EventSourceForConfidence[]): number {
  const hasTier12 = sources.some(
    (s) => s.reliability_tier === "High" || s.reliability_tier === "Medium"
  );
  const verified = event.primary_classification === "Verified Event";
  return verified && hasTier12 ? EVIDENCE_BONUS : 0;
}

function contradictionPenalty(sources: EventSourceForConfidence[]): number {
  let count = 0;
  const primaries = new Set(sources.map((s) => s.source_primary_classification).filter(Boolean));
  if (primaries.has("Verified Event") && primaries.has("Disputed Claim")) count++;
  const secondaries = new Set(
    sources.map((s) => s.source_secondary_classification).filter(Boolean)
  );
  if (secondaries.has("Official Claim") && secondaries.has("Opposition Claim")) count++;
  return count * CONTRADICTION_PENALTY;
}

function uniqueEcosystemCount(sources: EventSourceForConfidence[]): number {
  const keys = new Set(sources.map((s) => s.ecosystem_key ?? ""));
  return keys.size;
}

function timeDecayFactor(event: EventForConfidence, asOf?: Date): number {
  const ts = event.occurred_at ?? event.created_at;
  if (!ts || uniqueEcosystemCount(event.sources) > 1) return 1;
  const ref = asOf ?? new Date();
  const then = new Date(ts).getTime();
  const hours = (ref.getTime() - then) / (1000 * 60 * 60);
  if (hours <= DECAY_AGE_HOURS) return 1;
  return DECAY_FACTOR;
}

function scoreToLevel(score: number): ConfidenceLevel {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  if (clamped <= LEVEL_BANDS.Low[1]) return "Low";
  if (clamped <= LEVEL_BANDS.Medium[1]) return "Medium";
  return "High";
}

/**
 * Pure confidence calculation. No DB access.
 * @param event - Event payload with sources (caller must load from DB if needed).
 * @param asOf - Optional reference time for time decay; defaults to no decay.
 */
export function calculateConfidence(
  event: EventForConfidence,
  asOf?: Date
): ConfidenceResult {
  const sources = event.sources ?? [];
  let score =
    effectiveTierWeights(sources) + evidenceBonus(event, sources) - contradictionPenalty(sources);
  score *= timeDecayFactor(event, asOf);
  const level = scoreToLevel(score);
  const finalScore = Math.max(0, Math.min(100, Math.round(score * 100) / 100));
  return { score: finalScore, level };
}
