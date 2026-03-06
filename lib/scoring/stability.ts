/**
 * Phase 10B: Stability Score v1.
 * Pure, reproducible scoring: map events to risk points, time-decay, aggregate by country and global.
 * stability_score = 100 - normalizeRisk(aggregatedRisk).
 */

import { getRegionKey, REGION_KEY_UNKNOWN } from "@/lib/regionKey";

// --- Weights (tunable) ---

/** Severity: higher = more risk. */
export const SEVERITY_WEIGHTS: Record<string, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

/** Category: higher = more destabilizing. */
export const CATEGORY_WEIGHTS: Record<string, number> = {
  "Armed Conflict": 3,
  "Natural Disaster": 2.5,
  "Political Tension": 2,
  "Military Posture": 1.5,
  "Coercive Economic Action": 1.5,
  "Diplomatic Confrontation": 1,
};

/** Confidence: low confidence reduces impact. */
export const CONFIDENCE_WEIGHTS: Record<string, number> = {
  Low: 0.5,
  Medium: 1,
  High: 1.5,
};

/** Time decay: full weight within this many hours, then decay. */
const DECAY_AGE_HOURS = 24;
/** Multiplier applied when event is older than DECAY_AGE_HOURS. */
const DECAY_FACTOR = 0.9;

/**
 * Scale for raw risk before capping at 100. Tune so typical event sets don't all saturate.
 * A more sophisticated curve (e.g. logarithmic) can replace normalizeRisk later.
 */
const RISK_CAP = 100;

// --- Event shape (minimal; caller provides from DB or tests) ---

export interface EventForStability {
  severity: string;
  category: string;
  confidence_level?: string | null;
  occurred_at?: string | null;
  country_code?: string | null;
  primary_location?: string | null;
}

export interface StabilityScoreOptions {
  asOfDate: Date;
  windowDays: number;
}

export interface StabilityScoresResult {
  byCountry: Record<string, number>;
  global: number;
}

// --- Helpers ---

function getSeverityWeight(severity: string): number {
  return SEVERITY_WEIGHTS[severity] ?? 2;
}

function getCategoryWeight(category: string): number {
  return CATEGORY_WEIGHTS[category] ?? 1;
}

function getConfidenceWeight(confidenceLevel: string | null | undefined): number {
  if (!confidenceLevel) return 1;
  return CONFIDENCE_WEIGHTS[confidenceLevel] ?? 1;
}

/**
 * Base risk points for one event (severity × category × confidence).
 * Pure function; no time decay.
 */
export function eventRiskPoints(event: EventForStability): number {
  const severity = getSeverityWeight(event.severity);
  const category = getCategoryWeight(event.category);
  const confidence = getConfidenceWeight(event.confidence_level ?? null);
  return severity * category * confidence;
}

/**
 * Time-decay factor: 1 if event is within DECAY_AGE_HOURS of asOf, else DECAY_FACTOR.
 */
export function timeDecayFactor(event: EventForStability, asOf: Date): number {
  const ts = event.occurred_at;
  if (!ts) return 1;
  const then = new Date(ts).getTime();
  const hours = (asOf.getTime() - then) / (1000 * 60 * 60);
  return hours <= DECAY_AGE_HOURS ? 1 : DECAY_FACTOR;
}

/**
 * Map raw risk to 0–100 with a simple cap. Tune scale/curve later if needed.
 */
export function normalizeRisk(risk: number): number {
  const capped = Math.min(RISK_CAP, Math.max(0, risk));
  return Math.round(capped * 100) / 100;
}

/**
 * True if region key is a country code (not grid, not unknown).
 */
function isCountryKey(key: string): boolean {
  return key !== REGION_KEY_UNKNOWN && !key.startsWith("grid_");
}

/**
 * Filter events to occurred_at in [asOf - windowDays, asOf], then aggregate raw risk
 * by country and globally.
 */
export function aggregateRiskByCountry(
  events: EventForStability[],
  asOf: Date,
  windowDays: number
): { byCountry: Record<string, number>; global: number } {
  const windowStart = new Date(asOf);
  windowStart.setDate(windowStart.getDate() - windowDays);
  const windowStartMs = windowStart.getTime();
  const asOfMs = asOf.getTime();

  const byCountry: Record<string, number> = {};
  let global = 0;

  for (const event of events) {
    const ts = event.occurred_at ? new Date(event.occurred_at).getTime() : asOfMs;
    if (ts < windowStartMs || ts > asOfMs) continue;

    const risk = eventRiskPoints(event) * timeDecayFactor(event, asOf);
    const key = getRegionKey(
      event.country_code ?? null,
      event.primary_location ?? null
    );

    if (isCountryKey(key)) {
      byCountry[key] = (byCountry[key] ?? 0) + risk;
    }
    global += risk;
  }

  return { byCountry, global };
}

/**
 * Compute stability scores (0–100) per country and globally.
 * stability_score = 100 - normalizeRisk(aggregatedRisk).
 * Reproducible: same events + options => same result.
 */
export function computeStabilityScores(
  events: EventForStability[],
  options: StabilityScoreOptions
): StabilityScoresResult {
  const { asOfDate, windowDays } = options;
  const { byCountry, global } = aggregateRiskByCountry(events, asOfDate, windowDays);

  const byCountryScores: Record<string, number> = {};
  for (const [country, raw] of Object.entries(byCountry)) {
    const score = 100 - normalizeRisk(raw);
    byCountryScores[country] = Math.round(score * 100) / 100;
  }

  const globalScore = 100 - normalizeRisk(global);
  return {
    byCountry: byCountryScores,
    global: Math.round(globalScore * 100) / 100,
  };
}
