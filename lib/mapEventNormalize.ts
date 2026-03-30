import { parsePrimaryLocation } from "@/lib/eventCoordinates";

/**
 * Derive display coordinates for map UIs from GET /api/events rows.
 * Uses lat/lon when present; otherwise parses primary_location (same rules as the API).
 */
export function coordsForPublicMapEvent(e: {
  lat?: unknown;
  lon?: unknown;
  primary_location?: unknown;
}): { lat: number; lon: number } | null {
  const lat = e.lat;
  const lon = e.lon;
  if (
    lat != null &&
    lon != null &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lon))
  ) {
    const la = Number(lat);
    const lo = Number(lon);
    if (la === 0 && lo === 0) return null;
    return { lat: la, lon: lo };
  }
  const pl =
    typeof e.primary_location === "string"
      ? parsePrimaryLocation(e.primary_location)
      : null;
  if (pl) return { lat: pl.lat, lon: pl.lng };
  return null;
}
