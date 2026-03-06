/**
 * Server-side reverse geocoding via Mapbox Geocoding API v5.
 * Used to set events.country_code and events.admin1 from primary_location (lat,lng).
 *
 * Env: MAPBOX_ACCESS_TOKEN or NEXT_PUBLIC_MAPBOX_TOKEN
 */

export type ReverseGeocodeResult = {
  country_code: string | null;
  admin1: string | null;
};

const MAPBOX_BASE = "https://api.mapbox.com/geocoding/v5/mapbox.places";

function getToken(): string | null {
  return (
    (typeof process !== "undefined" && process.env?.MAPBOX_ACCESS_TOKEN) ||
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_MAPBOX_TOKEN) ||
    null
  );
}

type MapboxFeature = {
  place_type?: string[];
  properties?: { short_code?: string };
  text?: string;
  place_name?: string;
  context?: Array<{ id: string; text?: string }>;
};

type MapboxResponse = {
  features?: MapboxFeature[];
};

/**
 * Reverse geocode lng,lat to country (ISO2) and admin1 (region/state).
 * Returns nulls on missing token, API error, or no relevant features.
 */
export async function reverseGeocode(
  lng: number,
  lat: number
): Promise<ReverseGeocodeResult> {
  const token = getToken();
  if (!token?.trim()) {
    return { country_code: null, admin1: null };
  }

  const url = `${MAPBOX_BASE}/${encodeURIComponent(String(lng))},${encodeURIComponent(String(lat))}.json?access_token=${encodeURIComponent(token.trim())}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { country_code: null, admin1: null };
    }
    const body = (await res.json()) as MapboxResponse;
    const features = body?.features ?? [];

    let country_code: string | null = null;
    let admin1: string | null = null;

    for (const f of features) {
      const types = Array.isArray(f.place_type) ? f.place_type : [];
      if (types.includes("country")) {
        const code = f.properties?.short_code;
        if (typeof code === "string" && code.length >= 2) {
          country_code = code.toUpperCase().slice(0, 2);
          break;
        }
        const ctx = f.context;
        if (Array.isArray(ctx)) {
          const countryCtx = ctx.find((c) => c.id?.startsWith("country."));
          if (countryCtx?.id) {
            const part = countryCtx.id.split(".")[1];
            if (part && part.length === 2) country_code = part.toUpperCase();
          }
        }
        if (country_code) break;
      }
    }

    for (const f of features) {
      const types = Array.isArray(f.place_type) ? f.place_type : [];
      if (types.includes("region")) {
        const name = f.text ?? f.place_name;
        if (typeof name === "string" && name.trim()) {
          admin1 = name.trim().slice(0, 500);
          break;
        }
      }
    }

    return { country_code, admin1 };
  } catch {
    return { country_code: null, admin1: null };
  }
}
