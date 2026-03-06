import { parsePrimaryLocation } from "./eventCoordinates";

const UNKNOWN = "Unknown";

/**
 * Returns a stable bucket key for grouping events by location.
 * - If primary_location parses as "lat,lng", returns a grid bucket (1 decimal: e.g. "12.3,-5.4").
 * - Otherwise returns the trimmed string (country or region name), or "Unknown" if empty.
 */
export function getLocationBucket(primaryLocation: string | null | undefined): string {
  const s = primaryLocation?.trim();
  if (!s) return UNKNOWN;
  const coords = parsePrimaryLocation(s);
  if (coords) {
    const lat = Math.round(coords.lat * 10) / 10;
    const lng = Math.round(coords.lng * 10) / 10;
    return `${lat},${lng}`;
  }
  return s;
}
