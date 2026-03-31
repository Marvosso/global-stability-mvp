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
 * Map item returned by GET /api/public/events (incident or standalone event).
 * Used for one-marker-per-incident map; getEventCoordinates and timeline work via primary_location and occurred_at.
 */
export type PublicMapItem = {
  id: string;
  incident_id: string | null;
  title: string | null;
  category: string | null;
  subtype: string | null;
  severity: string | null;
  confidence_level: string | null;
  primary_location: string | null;
  occurred_at: string | null;
  source_count: number;
  country_code?: string | null;
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

/**
 * Strict coords: DB lat/lon columns or parseable "lat,lng" primary_location only.
 * For public maps and APIs, use `coordsForPublicListing` in geoResolve (also uses country_code + title/summary).
 */
export function coordsFromEventRow(row: {
  primary_location?: string | null;
  lat?: number | null;
  lon?: number | null;
}): { lat: number; lng: number } | null {
  const la = row.lat;
  const lo = row.lon;
  if (
    la != null &&
    lo != null &&
    Number.isFinite(Number(la)) &&
    Number.isFinite(Number(lo)) &&
    Number(la) >= -90 &&
    Number(la) <= 90 &&
    Number(lo) >= -180 &&
    Number(lo) <= 180
  ) {
    return { lat: Number(la), lng: Number(lo) };
  }
  return parsePrimaryLocation(row.primary_location ?? null);
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
 * Country centroids by ISO 3166-1 alpha-2 code.
 * Values are [lat, lng]. Used as last-resort fallback in getEventCoordinates.
 */
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  AF: [33.0, 65.0],
  AL: [41.1, 20.2],
  DZ: [28.0, 3.0],
  AO: [-11.2, 17.9],
  AG: [17.1, -61.8],
  AR: [-38.4, -63.6],
  AM: [40.1, 45.0],
  AU: [-25.3, 133.8],
  AT: [47.5, 14.6],
  AZ: [40.1, 47.6],
  BS: [24.2, -76.0],
  BH: [26.0, 50.6],
  BD: [23.7, 90.4],
  BB: [13.2, -59.6],
  BY: [53.7, 27.9],
  BE: [50.5, 4.5],
  BZ: [17.2, -88.5],
  BJ: [9.3, 2.3],
  BT: [27.5, 90.5],
  BO: [-16.3, -63.6],
  BA: [43.9, 17.7],
  BW: [-22.3, 24.7],
  BR: [-14.2, -51.9],
  BN: [4.5, 114.7],
  BG: [42.7, 25.5],
  BF: [12.4, -1.6],
  BI: [-3.4, 29.9],
  CV: [16.0, -24.0],
  KH: [12.6, 104.9],
  CM: [7.4, 12.4],
  CA: [56.1, -106.3],
  CF: [6.6, 20.9],
  TD: [15.5, 18.7],
  CL: [-35.7, -71.5],
  CN: [35.9, 104.2],
  CO: [4.1, -72.9],
  KM: [-11.6, 43.3],
  CG: [-0.2, 15.8],
  CD: [-4.0, 21.8],
  CR: [9.7, -83.8],
  CI: [7.5, -5.5],
  HR: [45.1, 15.2],
  CU: [21.5, -79.5],
  CY: [35.1, 33.4],
  CZ: [49.8, 15.5],
  DK: [56.3, 9.5],
  DJ: [11.8, 42.6],
  DM: [15.3, -61.4],
  DO: [18.7, -70.2],
  EC: [-1.8, -78.2],
  EG: [26.8, 30.8],
  SV: [13.8, -88.9],
  GQ: [1.7, 10.3],
  ER: [15.2, 39.8],
  EE: [58.6, 25.0],
  SZ: [-26.5, 31.5],
  ET: [9.1, 40.5],
  FJ: [-17.7, 178.1],
  FI: [64.0, 25.7],
  FR: [46.2, 2.2],
  GA: [-0.8, 11.6],
  GM: [13.4, -15.3],
  GE: [42.3, 43.4],
  DE: [51.2, 10.5],
  GH: [7.9, -1.0],
  GR: [39.1, 21.8],
  GD: [12.1, -61.7],
  GT: [15.8, -90.2],
  GN: [11.0, -10.9],
  GW: [11.8, -15.2],
  GY: [4.9, -58.9],
  HT: [18.9, -72.3],
  HN: [15.2, -86.2],
  HU: [47.2, 19.5],
  IS: [65.0, -18.0],
  IN: [20.6, 78.9],
  ID: [-2.5, 118.0],
  IR: [32.4, 53.7],
  IQ: [33.2, 43.7],
  IE: [53.4, -8.2],
  IL: [31.0, 34.9],
  IT: [41.9, 12.6],
  JM: [18.1, -77.3],
  JP: [36.2, 138.3],
  JO: [31.2, 36.5],
  KZ: [48.0, 66.9],
  KE: [0.0, 37.9],
  KI: [1.9, -157.4],
  KW: [29.3, 47.5],
  KG: [41.2, 74.8],
  LA: [19.9, 102.5],
  LV: [56.9, 24.6],
  LB: [33.9, 35.5],
  LS: [-29.6, 28.2],
  LR: [6.4, -9.4],
  LY: [26.3, 17.2],
  LT: [55.2, 23.9],
  LU: [49.8, 6.1],
  MG: [-18.8, 46.9],
  MW: [-13.3, 34.3],
  MY: [4.2, 108.0],
  MV: [3.2, 73.2],
  ML: [17.6, -2.0],
  MT: [35.9, 14.4],
  MH: [7.1, 171.2],
  MR: [21.0, -10.9],
  MU: [-20.3, 57.6],
  MX: [23.6, -102.6],
  FM: [6.9, 158.2],
  MD: [47.4, 28.4],
  MN: [46.9, 103.8],
  ME: [42.7, 19.4],
  MA: [31.8, -7.1],
  MZ: [-18.7, 35.5],
  MM: [19.2, 96.7],
  NA: [-22.0, 17.1],
  NR: [-0.5, 166.9],
  NP: [28.4, 84.1],
  NL: [52.1, 5.3],
  NZ: [-40.9, 174.9],
  NI: [12.9, -85.2],
  NE: [17.6, 8.1],
  NG: [9.1, 8.7],
  KP: [40.3, 127.5],
  MK: [41.6, 21.7],
  NO: [60.5, 8.5],
  OM: [21.0, 57.0],
  PK: [30.4, 69.3],
  PW: [7.5, 134.6],
  PA: [8.5, -80.8],
  PG: [-6.3, 143.9],
  PY: [-23.4, -58.4],
  PE: [-9.2, -75.0],
  PH: [13.0, 122.6],
  PL: [52.0, 19.1],
  PT: [39.4, -8.2],
  PS: [31.9, 35.3],
  QA: [25.4, 51.2],
  RO: [45.9, 24.9],
  RU: [61.5, 105.3],
  RW: [-1.9, 29.9],
  KN: [17.3, -62.7],
  LC: [13.9, -60.9],
  VC: [13.3, -61.2],
  WS: [-13.8, -172.1],
  SM: [43.9, 12.5],
  ST: [0.2, 6.6],
  SA: [24.0, 45.1],
  SN: [14.5, -14.5],
  RS: [44.0, 21.0],
  SC: [-4.7, 55.5],
  SL: [8.5, -11.8],
  SG: [1.3, 103.8],
  SK: [48.7, 19.7],
  SI: [46.2, 14.9],
  SB: [-9.6, 160.2],
  SO: [6.0, 46.2],
  ZA: [-29.0, 25.1],
  KR: [36.5, 127.8],
  SS: [7.9, 29.7],
  ES: [40.5, -3.7],
  LK: [7.9, 80.8],
  SD: [12.9, 30.2],
  SR: [3.9, -56.0],
  SE: [60.1, 18.6],
  CH: [46.8, 8.2],
  SY: [34.8, 38.9],
  TW: [23.7, 121.0],
  TJ: [38.9, 71.3],
  TZ: [-6.4, 34.9],
  TH: [15.9, 100.9],
  TL: [-8.9, 125.7],
  TG: [8.6, 0.8],
  TO: [-21.2, -175.2],
  TT: [10.7, -61.5],
  TN: [33.9, 9.6],
  TR: [38.9, 35.2],
  TM: [38.9, 59.6],
  TV: [-7.1, 177.6],
  UG: [1.4, 32.3],
  UA: [48.4, 31.2],
  AE: [23.4, 53.8],
  GB: [55.4, -3.4],
  US: [37.1, -95.7],
  UY: [-32.5, -55.8],
  UZ: [41.4, 64.6],
  VU: [-15.4, 166.9],
  VE: [6.4, -66.6],
  VN: [14.1, 108.3],
  YE: [15.6, 48.5],
  ZM: [-13.1, 27.8],
  ZW: [-20.0, 30.0],
};

/**
 * Internal type for accessing all optional coordinate fields across the union.
 * Not all members of the union have every field, so we cast to this for resolution steps.
 */
type EventWithOptionalCoords = {
  latitude?: number | null;
  longitude?: number | null;
  geometry?: { type: string; coordinates: [number, number] } | null;
  primary_location?: string | null;
  country_code?: string | null;
};

/**
 * Returns [lng, lat] for Mapbox GeoJSON, or null if event has no usable coordinates.
 * Tries four resolution steps in order:
 *   1. Explicit latitude/longitude fields on the event
 *   2. geometry.coordinates GeoJSON field ([lng, lat] per GeoJSON spec)
 *   3. primary_location parsed as "lat,lng" numeric string (existing behavior)
 *   4. country_code centroid fallback via COUNTRY_CENTROIDS lookup table
 */
export function getEventCoordinates(
  event: MapEventMarkerShape | PublicEvent | PublicMapItem
): [number, number] | null {
  const e = event as EventWithOptionalCoords;

  // Step 1: explicit latitude/longitude fields
  const lat = e.latitude;
  const lng = e.longitude;
  if (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  ) {
    return [lng, lat];
  }

  // Step 2: geometry.coordinates GeoJSON field (stored as [lng, lat] per GeoJSON spec)
  const coords = e.geometry?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const gLng = coords[0];
    const gLat = coords[1];
    if (
      Number.isFinite(gLat) &&
      Number.isFinite(gLng) &&
      gLat >= -90 &&
      gLat <= 90 &&
      gLng >= -180 &&
      gLng <= 180
    ) {
      return [gLng, gLat];
    }
  }

  // Step 3: primary_location parsed as "lat,lng" numeric string (existing behavior)
  const parsed = parsePrimaryLocation(e.primary_location);
  if (parsed) return [parsed.lng, parsed.lat];

  // Step 4: country_code centroid fallback
  const cc = typeof e.country_code === "string" ? e.country_code.trim().toUpperCase() : null;
  if (cc) {
    const centroid = COUNTRY_CENTROIDS[cc];
    if (centroid) return [centroid[1], centroid[0]]; // return [lng, lat]
  }

  return null;
}
