/**
 * Shape returned by GET /api/public/events.
 * Optional latitude/longitude for when backend adds them.
 */
export type PublicEvent = {
  id: string;
  title: string;
  summary: string;
  details?: string | null;
  category: string;
  subtype?: string | null;
  primary_classification?: string;
  secondary_classification?: string | null;
  severity: string;
  confidence_level?: string;
  occurred_at?: string | null;
  ended_at?: string | null;
  primary_location?: string | null;
  created_at: string;
  updated_at?: string;
  latitude?: number | null;
  longitude?: number | null;
  geometry?: { type: "Point"; coordinates: [number, number] } | null;
  country_code?: string | null;
  context_background?: string | null;
  key_parties?: string | null;
  competing_claims?: Array<{
    claim: string;
    attributed_to?: string | null;
    confidence?: string | null;
  }> | null;
};

/**
 * Minimal shape required for map markers. API may return more fields.
 */
export type MapEventMarkerShape = {
  id: string;
  title?: string | null;
  summary?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  primary_location?: string | null;
  geometry?: { type: "Point"; coordinates: [number, number] } | null;
  category: string;
  subtype?: string | null;
  severity: string;
  severity_level?: number;
  created_at?: string | null;
};

/**
 * Parses primary_location string ("lat, lng") with validation.
 * Trims spaces, validates numeric and ranges (lat -90..90, lng -180..180).
 */
export function parsePrimaryLocation(
  str: string | null | undefined
): { lat: number; lng: number } | null {
  const s = str?.trim();
  if (!s) return null;
  const parts = s
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const lat = Number.parseFloat(parts[0]);
  const lng = Number.parseFloat(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/** Earth radius in km for Haversine. */
const EARTH_RADIUS_KM = 6371;

/**
 * Distance between two points in km (Haversine).
 * Used for event deduplication (match within 100 km).
 */
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Returns [lng, lat] for Mapbox GeoJSON, or null if event has no usable coordinates.
 * Uses parsePrimaryLocation for primary_location (with range validation).
 */
export function getEventCoordinates(
  event: MapEventMarkerShape | PublicEvent
): [number, number] | null {
  const parsed = parsePrimaryLocation(event.primary_location);
  if (parsed) return [parsed.lng, parsed.lat];
  return null;
}
