import { parsePrimaryLocation } from "./eventCoordinates";

const UNKNOWN = "unknown";

/**
 * Returns a stable region key for escalation grouping.
 * - If countryCode is non-empty, return it normalized (uppercase, trimmed).
 * - Else if primary_location parses as lat,lng, return grid key at 0.5° resolution (e.g. grid_31.5_34.5).
 * - Else return "unknown" (exclude from escalation rules).
 */
export function getRegionKey(
  countryCode: string | null | undefined,
  primaryLocation: string | null | undefined
): string {
  const code = countryCode?.trim();
  if (code && code.length > 0) {
    return code.toUpperCase();
  }
  const coords = parsePrimaryLocation(primaryLocation);
  if (coords) {
    const lat = Math.round(coords.lat * 2) / 2;
    const lng = Math.round(coords.lng * 2) / 2;
    return `grid_${lat}_${lng}`;
  }
  return UNKNOWN;
}

export { UNKNOWN as REGION_KEY_UNKNOWN };
