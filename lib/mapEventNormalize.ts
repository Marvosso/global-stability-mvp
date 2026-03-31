import { coordsForPublicListing } from "@/lib/geoResolve";

/**
 * Derive display coordinates for map UIs from GET /api/events rows.
 * Uses the same resolution as the API: exact coords, primary_location, country_code, text inference.
 */
export function coordsForPublicMapEvent(e: {
  lat?: unknown;
  lon?: unknown;
  primary_location?: unknown;
  title?: unknown;
  summary?: unknown;
  country_code?: unknown;
}): { lat: number; lon: number } | null {
  const c = coordsForPublicListing({
    lat: e.lat as number | null,
    lon: e.lon as number | null,
    primary_location: typeof e.primary_location === "string" ? e.primary_location : null,
    title: typeof e.title === "string" ? e.title : null,
    summary: typeof e.summary === "string" ? e.summary : null,
    country_code: typeof e.country_code === "string" ? e.country_code : null,
  });
  if (!c) return null;
  return { lat: c.lat, lon: c.lng };
}
