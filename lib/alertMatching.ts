import { parsePrimaryLocation } from "./eventCoordinates";

/**
 * Event fields used for watchlist matching (category, severity, confidence, location).
 */
export type EventSnapshotForAlerts = {
  category: string;
  severity: string;
  confidence_level: string | null;
  primary_location: string | null;
  country_code: string | null;
};

/**
 * Watchlist row fields needed for matching.
 */
export type WatchlistRowForAlerts = {
  id: string;
  user_id: string;
  categories: string[];
  severities: string[];
  confidence_levels: string[];
  countries: string[];
  bbox: number[] | Record<string, unknown> | null;
};

/**
 * bbox: GeoJSON format [minLng, minLat, maxLng, maxLat].
 * Point (lng, lat) is inside when minLng <= lng <= maxLng and minLat <= lat <= maxLat.
 */
function pointInBbox(
  lng: number,
  lat: number,
  bbox: number[] | Record<string, unknown> | null
): boolean {
  if (!bbox || !Array.isArray(bbox) || bbox.length < 4) return false;
  const [minLng, minLat, maxLng, maxLat] = bbox as [number, number, number, number];
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= minLng &&
    lng <= maxLng &&
    lat >= minLat &&
    lat <= maxLat
  );
}

function normalizeForMatch(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/**
 * Returns true if the watchlist matches the event per Phase 5B rules:
 * category, severity, confidence_level, location (country or bbox).
 * Empty arrays on watchlist mean "match all" for that dimension.
 */
export function watchlistMatchesEvent(
  event: EventSnapshotForAlerts,
  watchlist: WatchlistRowForAlerts
): boolean {
  if (
    watchlist.categories.length > 0 &&
    !watchlist.categories.map((c) => c.trim().toLowerCase()).includes(event.category.trim().toLowerCase())
  ) {
    return false;
  }
  if (
    watchlist.severities.length > 0 &&
    !watchlist.severities.map((s) => s.trim().toLowerCase()).includes(event.severity.trim().toLowerCase())
  ) {
    return false;
  }
  if (
    watchlist.confidence_levels.length > 0 &&
    (!event.confidence_level ||
      !watchlist.confidence_levels
        .map((c) => c.trim().toLowerCase())
        .includes(event.confidence_level.trim().toLowerCase()))
  ) {
    return false;
  }

  const eventCountry = normalizeForMatch(event.country_code);
  if (watchlist.countries.length > 0) {
    const watchlistCountries = watchlist.countries.map((c) => normalizeForMatch(c));
    if (!eventCountry || !watchlistCountries.includes(eventCountry)) {
      return false;
    }
  }

  const bbox = watchlist.bbox;
  if (bbox && Array.isArray(bbox) && bbox.length >= 4) {
    const coords = parsePrimaryLocation(event.primary_location);
    if (!coords || !pointInBbox(coords.lng, coords.lat, bbox)) {
      return false;
    }
  }

  return true;
}

// --- Phase 15A: row-based watchlist matching ---

/**
 * Event snapshot for Phase 15A matching (category, country_code; actor names loaded separately).
 */
export type EventSnapshotForEntryMatching = {
  category: string;
  country_code: string | null;
};

/**
 * Phase 15A watchlist entry row (one row per watch_type + watch_value).
 */
export type WatchlistEntryRow = {
  id: string;
  user_id: string;
  watch_type: string;
  watch_value: string;
  email_notifications?: boolean;
};

function normalize(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/**
 * Returns true if this watchlist entry matches the event.
 * country: event.country_code matches watch_value (normalized).
 * category: event.category matches watch_value (normalized).
 * actor: at least one of actorNames (normalized) equals watch_value (normalized).
 */
export function watchlistEntryMatchesEvent(
  event: EventSnapshotForEntryMatching,
  actorNames: string[],
  entry: WatchlistEntryRow
): boolean {
  const value = normalize(entry.watch_value);
  if (!value) return false;

  switch (entry.watch_type) {
    case "country": {
      const eventCountry = normalize(event.country_code);
      return eventCountry !== "" && eventCountry === value;
    }
    case "category": {
      const eventCategory = normalize(event.category);
      return eventCategory === value;
    }
    case "actor": {
      const normalizedActorNames = actorNames.map(normalize);
      return normalizedActorNames.includes(value);
    }
    default:
      return false;
  }
}
