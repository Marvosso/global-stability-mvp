import {
  getCountryCentroid,
  centroidToPrimaryLocation,
  inferCountryFromText,
} from "@/lib/countryCentroids";
import { parsePrimaryLocation } from "@/lib/eventCoordinates";

/**
 * Pull decimal lat/lon from titles, summaries, or snippets (e.g. "near 12.34, -56.78").
 * Ignores implausible matches by range check.
 */
export function extractCoordinatesFromText(text: string | null | undefined): { lat: number; lon: number } | null {
  if (!text?.trim()) return null;
  const s = text;
  const re = /\b(-?\d{1,2}\.\d+)\s*[,;]\s*(-?\d{1,3}\.\d+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const lat = parseFloat(m[1]);
    const lon = parseFloat(m[2]);
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
  }
  return null;
}

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
 * Order: embedded coordinates, hotspots, regional phrases, inferCountryFromText + centroid.
 */
export function resolveTitleCentroidFallback(title: string): { lat: number; lon: number } | null {
  const fromText = extractCoordinatesFromText(title);
  if (fromText) return fromText;

  const t = title.toLowerCase();
  if (/\bmiddle east\b|\blevant\b|\bgulf states\b/i.test(t)) {
    return { lat: 29.0, lon: 45.0 };
  }
  if (/\bsahel\b|\bwest africa\b/i.test(t)) {
    return { lat: 15.0, lon: 0.0 };
  }
  if (/\beastern europe\b|\bbaltics\b/i.test(t)) {
    return { lat: 52.0, lon: 25.0 };
  }
  if (/\bsoutheast asia\b|\bindochina\b/i.test(t)) {
    return { lat: 10.0, lon: 105.0 };
  }
  if (t.includes("ukraine") || t.includes("kharkiv") || t.includes("kyiv") || t.includes("donbas")) {
    return { lat: 49.0, lon: 32.0 };
  }
  if (
    t.includes("gaza") ||
    t.includes("israel") ||
    t.includes("palestine") ||
    t.includes("tel aviv") ||
    t.includes("jerusalem")
  ) {
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
  if (t.includes("miami")) {
    return { lat: 25.76, lon: -80.19 };
  }
  if (t.includes("iowa")) {
    return { lat: 41.88, lon: -93.1 };
  }
  const code = inferCountryFromText(title);
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
 * Resolve coordinates for an event row during backfill: parsed location, text extraction,
 * country code, combined title+summary inference, then title/summary keyword fallbacks.
 */
export function resolveCoordsForBackfill(row: {
  title: string | null;
  summary: string | null;
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

  const blob = [row.title, row.summary].filter(Boolean).join("\n");
  const fromTitle = extractCoordinatesFromText(row.title);
  if (fromTitle) {
    return {
      lat: fromTitle.lat,
      lon: fromTitle.lon,
      approximated: true,
      primary_location: `${fromTitle.lat},${fromTitle.lon}`,
    };
  }
  const fromSummary = extractCoordinatesFromText(row.summary);
  if (fromSummary) {
    return {
      lat: fromSummary.lat,
      lon: fromSummary.lon,
      approximated: true,
      primary_location: `${fromSummary.lat},${fromSummary.lon}`,
    };
  }
  const fromBlob = extractCoordinatesFromText(blob);
  if (fromBlob) {
    return {
      lat: fromBlob.lat,
      lon: fromBlob.lon,
      approximated: true,
      primary_location: `${fromBlob.lat},${fromBlob.lon}`,
    };
  }

  const cc = row.country_code?.trim();
  const centroid = cc ? getCountryCentroid(cc) : null;
  if (centroid) {
    const primary_location = centroidToPrimaryLocation(centroid);
    const [lat, lon] = centroid;
    return { lat, lon, approximated: true, primary_location };
  }

  const inferredCode = inferCountryFromText(blob);
  const inferredCentroid = inferredCode ? getCountryCentroid(inferredCode) : null;
  if (inferredCentroid) {
    const primary_location = centroidToPrimaryLocation(inferredCentroid);
    const [lat, lon] = inferredCentroid;
    return { lat, lon, approximated: true, primary_location };
  }

  const tfTitle = row.title ? resolveTitleCentroidFallback(row.title) : null;
  if (tfTitle) {
    return {
      lat: tfTitle.lat,
      lon: tfTitle.lon,
      approximated: true,
      primary_location: `${tfTitle.lat},${tfTitle.lon}`,
    };
  }
  const tfSummary = row.summary ? resolveTitleCentroidFallback(row.summary) : null;
  if (tfSummary) {
    return {
      lat: tfSummary.lat,
      lon: tfSummary.lon,
      approximated: true,
      primary_location: `${tfSummary.lat},${tfSummary.lon}`,
    };
  }

  /** Optional: force a placeholder so DB always has lat/lon (set GEO_BACKFILL_NULL_ISLAND=true). */
  if (process.env.GEO_BACKFILL_NULL_ISLAND === "true") {
    return {
      lat: 0,
      lon: 0,
      approximated: true,
      primary_location: "0,0",
    };
  }
  return null;
}
