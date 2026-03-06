/**
 * Client-side importance score for events (e.g. Situation sidebar, sorting).
 * Same formula as crisis-heatmap and weekly brief: severity × (0.5 + confidence/100) × recency.
 */

export type EventForImportance = {
  severity: string;
  confidence_score?: number | null;
  confidence_level?: string | null;
  occurred_at?: string | null;
};

const SEVERITY_WEIGHT: Record<string, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

function confidenceScore(score: number | null | undefined, level: string | null | undefined): number {
  if (score != null && !Number.isNaN(score)) return Math.max(0, Math.min(100, score));
  if (level === "High") return 67;
  if (level === "Medium") return 50;
  if (level === "Low") return 33;
  return 50;
}

function recencyFactor(occurredAt: string | null | undefined, asOf: Date): number {
  if (!occurredAt) return 0.7;
  const t = new Date(occurredAt).getTime();
  const end = asOf.getTime();
  const daysAgo = (end - t) / (24 * 60 * 60 * 1000);
  if (daysAgo <= 0) return 1;
  return Math.max(0.5, 1 - 0.08 * daysAgo);
}

/**
 * Compute importance score for an event (higher = more significant).
 * Used to sort and surface "major" events in the Situation sidebar.
 */
export function computeImportance(event: EventForImportance, asOf: Date): number {
  const sw = SEVERITY_WEIGHT[event.severity] ?? 2;
  const conf = confidenceScore(event.confidence_score, event.confidence_level);
  const rec = recencyFactor(event.occurred_at, asOf);
  return sw * (0.5 + conf / 100) * rec;
}
