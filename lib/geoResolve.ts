import {
  getCountryCentroid,
  centroidToPrimaryLocation,
  inferCountryFromTitle,
} from "@/lib/countryCentroids";
import { parsePrimaryLocation } from "@/lib/eventCoordinates";

/** Parse lat/lon from ingest item fields or "lat,lon" location string. */
export function coordsFromIngestItem(item: {
  location?: string | null;
  lat?: unknown;
  lng?: unknown;
  lon?: unknown;
}): { lat: number; lon: number } | null {
  const toNum = (v: unknown): number => {
    if (v == null || v === "") return NaN;
    const n = typeof v === "string" ? parseFloat(v.trim()) : Number(v);
    return Number.isFinite(n) ? n : NaN;
  };
  const lat = toNum(item.lat);
  const lon = toNum(item.lng ?? item.lon);
  if (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  ) {
    return { lat, lon };
  }
  const pl = parsePrimaryLocation(item.location ?? null);
  if (pl) return { lat: pl.lat, lon: pl.lng };
  return null;
}

/**
 * Title/keyword-based centroid fallbacks (GDELT and backfill) when geo fields are missing.
 * Order: specific hotspots, then inferCountryFromTitle + country centroid.
 */
export function resolveTitleCentroidFallback(title: string): { lat: number; lon: number } | null {
  const t = title.toLowerCase();
  if (t.includes("ukraine") || t.includes("kharkiv") || t.includes("kyiv") || t.includes("donbas")) {
    return { lat: 49.0, lon: 32.0 };
  }
  if (t.includes("gaza") || t.includes("israel") || t.includes("tel aviv") || t.includes("jerusalem")) {
    return { lat: 31.5, lon: 34.45 };
  }
  if (t.includes("iran") || t.includes("tehran")) {
    return { lat: 32.0, lon: 53.0 };
  }
  if (t.includes("syria") || t.includes("damascus") || t.includes("aleppo")) {
    return { lat: 35.0, lon: 38.0 };
  }
  if (t.includes("russia") || t.includes("moscow")) {
    return { lat: 55.75, lon: 37.62 };
  }
  if (t.includes("sudan") || t.includes("khartoum")) {
    return { lat: 15.5, lon: 32.5 };
  }
  if (t.includes("yemen") || t.includes("sanaa")) {
    return { lat: 15.5, lon: 48.0 };
  }
  const code = inferCountryFromTitle(title);
  const c = code ? getCountryCentroid(code) : null;
  return c ? { lat: c[0], lon: c[1] } : null;
}

export type ResolvedCoords = {
  lat: number;
  lon: number;
  approximated: boolean;
  primary_location: string;
};

/**
 * Resolve coordinates for an event row during backfill: parsed location, then country, then title.
 */
export function resolveCoordsForBackfill(row: {
  title: string | null;
  primary_location: string | null;
  country_code: string | null;
}): ResolvedCoords | null {
  const parsed = parsePrimaryLocation(row.primary_location);
  if (parsed) {
    return {
      lat: parsed.lat,
      lon: parsed.lng,
      approximated: false,
      primary_location: `${parsed.lat},${parsed.lng}`,
    };
  }
  const cc = row.country_code?.trim();
  const centroid = cc ? getCountryCentroid(cc) : null;
  if (centroid) {
    const primary_location = centroidToPrimaryLocation(centroid);
    const [lat, lon] = centroid;
    return { lat, lon, approximated: true, primary_location };
  }
  const tf = row.title ? resolveTitleCentroidFallback(row.title) : null;
  if (tf) {
    return {
      lat: tf.lat,
      lon: tf.lon,
      approximated: true,
      primary_location: `${tf.lat},${tf.lon}`,
    };
  }
  return null;
}
