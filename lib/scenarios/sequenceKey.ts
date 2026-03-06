/**
 * Builds a stable sequence key from event taxonomy for scenario pattern matching.
 * Format: "Category|Subtype|Severity" (subtype empty string if null).
 */
export function getSequenceKey(
  category: string,
  subtype: string | null | undefined,
  severity: string
): string {
  const c = (category ?? "").trim();
  const s = (subtype ?? "").trim();
  const v = (severity ?? "").trim();
  return `${c}|${s}|${v}`;
}

