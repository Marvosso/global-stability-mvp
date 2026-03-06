/**
 * Severity level 1–4 for marker size. API severity enum → number.
 */
const SEVERITY_TO_LEVEL: Record<string, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

/**
 * Confidence level → opacity (0.5–1). Used for circle-opacity.
 */
const CONFIDENCE_TO_OPACITY: Record<string, number> = {
  Low: 0.5,
  Medium: 0.75,
  High: 1,
};

export const MARKER_BASE_RADIUS = 6;
export const MARKER_RADIUS_STEP = 3;

/** Severity level 1–4; default 1 if unknown. */
export function getSeverityLevel(severity: string): number {
  return SEVERITY_TO_LEVEL[severity] ?? 1;
}

/** Opacity 0.5–1 from confidence_level; default 1 if missing. */
export function getConfidenceOpacity(confidenceLevel?: string | null): number {
  if (!confidenceLevel) return 1;
  return CONFIDENCE_TO_OPACITY[confidenceLevel] ?? 1;
}

/** Circle radius for a given severity level (1–4). */
export function getRadiusForLevel(level: number): number {
  return MARKER_BASE_RADIUS + (level - 1) * MARKER_RADIUS_STEP;
}

export const SEVERITY_LABELS: Record<number, string> = {
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Critical",
};

export const CONFIDENCE_OPACITY_SAMPLES = [
  { label: "Low", opacity: 0.5 },
  { label: "Medium", opacity: 0.75 },
  { label: "High", opacity: 1 },
] as const;
