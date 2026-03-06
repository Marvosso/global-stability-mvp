import { supabaseAdmin } from "@/app/api/_lib/db";
import { getRegionKey, REGION_KEY_UNKNOWN } from "@/lib/regionKey";
import { parsePrimaryLocation } from "@/lib/eventCoordinates";

const LOOKBACK_HOURS = 24;
const RULE1_WINDOW_HOURS = 6;
const RULE1_MIN_COUNT = 3;
const RULE1_CATEGORIES = ["Political Tension", "Armed Conflict"];
const RULE2_WINDOW_HOURS = 24;
const RULE2_MIN_COUNT = 5;
const RULE3_WINDOW_HOURS = 12;
const RULE3_MIN_COUNT = 2;
const RULE3_SEVERITY = "High";

type EventRow = {
  id: string;
  country_code: string | null;
  primary_location: string | null;
  category: string;
  severity: string;
  occurred_at: string | null;
  created_at: string;
};

type EnrichedEvent = EventRow & {
  region_key: string;
  time: number;
  lng: number | null;
  lat: number | null;
};

type Candidate = {
  region_key: string;
  category: string;
  severity: string;
  event_count: number;
  window_hours: number;
  event_ids: string[];
  centroid_lng: number | null;
  centroid_lat: number | null;
};

function computeCentroid(events: EnrichedEvent[]): { lng: number; lat: number } | null {
  const withCoords = events.filter((e) => e.lng != null && e.lat != null);
  if (withCoords.length === 0) return null;
  const sumLng = withCoords.reduce((a, e) => a + (e.lng ?? 0), 0);
  const sumLat = withCoords.reduce((a, e) => a + (e.lat ?? 0), 0);
  return {
    lng: sumLng / withCoords.length,
    lat: sumLat / withCoords.length,
  };
}

export async function runEscalationDetection(): Promise<{ created: number }> {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabaseAdmin
    .from("events")
    .select("id, country_code, primary_location, category, severity, occurred_at, created_at")
    .eq("status", "Published")
    .or(`occurred_at.gte.${since},created_at.gte.${since}`);

  if (error) throw new Error(error.message);

  const events = (rows ?? []) as EventRow[];
  const now = Date.now();
  const sinceTs = now - LOOKBACK_HOURS * 60 * 60 * 1000;

  const enriched: EnrichedEvent[] = [];
  for (const e of events) {
    const ts = e.occurred_at ? new Date(e.occurred_at).getTime() : new Date(e.created_at).getTime();
    if (ts < sinceTs) continue;
    const region_key = getRegionKey(e.country_code, e.primary_location);
    if (region_key === REGION_KEY_UNKNOWN) continue;
    const coords = parsePrimaryLocation(e.primary_location);
    enriched.push({
      ...e,
      region_key,
      time: ts,
      lng: coords?.lng ?? null,
      lat: coords?.lat ?? null,
    });
  }

  const byRegion = new Map<string, EnrichedEvent[]>();
  for (const e of enriched) {
    const list = byRegion.get(e.region_key) ?? [];
    list.push(e);
    byRegion.set(e.region_key, list);
  }

  const candidates: Candidate[] = [];

  for (const [region_key, list] of byRegion) {
    const in6h = list.filter((e) => e.time >= now - RULE1_WINDOW_HOURS * 60 * 60 * 1000);
    const in12h = list.filter((e) => e.time >= now - RULE3_WINDOW_HOURS * 60 * 60 * 1000);
    const in24h = list.filter((e) => e.time >= now - RULE2_WINDOW_HOURS * 60 * 60 * 1000);

    const rule1Events = in6h.filter((e) => RULE1_CATEGORIES.includes(e.category));
    if (rule1Events.length >= RULE1_MIN_COUNT) {
      const category = rule1Events[0].category;
      const centroid = computeCentroid(rule1Events);
      candidates.push({
        region_key,
        category,
        severity: "Any",
        event_count: rule1Events.length,
        window_hours: RULE1_WINDOW_HOURS,
        event_ids: rule1Events.map((e) => e.id),
        centroid_lng: centroid?.lng ?? null,
        centroid_lat: centroid?.lat ?? null,
      });
    }

    if (in24h.length >= RULE2_MIN_COUNT) {
      const centroid = computeCentroid(in24h);
      candidates.push({
        region_key,
        category: "Any",
        severity: "Any",
        event_count: in24h.length,
        window_hours: RULE2_WINDOW_HOURS,
        event_ids: in24h.map((e) => e.id),
        centroid_lng: centroid?.lng ?? null,
        centroid_lat: centroid?.lat ?? null,
      });
    }

    const rule3Events = in12h.filter((e) => e.severity === RULE3_SEVERITY);
    if (rule3Events.length >= RULE3_MIN_COUNT) {
      const centroid = computeCentroid(rule3Events);
      candidates.push({
        region_key,
        category: "Any",
        severity: RULE3_SEVERITY,
        event_count: rule3Events.length,
        window_hours: RULE3_WINDOW_HOURS,
        event_ids: rule3Events.map((e) => e.id),
        centroid_lng: centroid?.lng ?? null,
        centroid_lat: centroid?.lat ?? null,
      });
    }
  }

  const { data: existing } = await supabaseAdmin
    .from("escalation_alerts")
    .select("region_key, category, severity, window_hours")
    .is("resolved_at", null);

  const existingKey = (r: string, c: string, s: string, w: number) =>
    `${r}|${c}|${s}|${w}`;
  const existingSet = new Set(
    (existing ?? []).map((e) =>
      existingKey(e.region_key, e.category, e.severity, e.window_hours)
    )
  );

  const toInsert = candidates.filter(
    (c) => !existingSet.has(existingKey(c.region_key, c.category, c.severity, c.window_hours))
  );

  if (toInsert.length === 0) return { created: 0 };

  const { error: insertError } = await supabaseAdmin.from("escalation_alerts").insert(
    toInsert.map((c) => ({
      region_key: c.region_key,
      category: c.category,
      severity: c.severity,
      event_count: c.event_count,
      window_hours: c.window_hours,
      event_ids: c.event_ids,
      centroid_lng: c.centroid_lng,
      centroid_lat: c.centroid_lat,
    }))
  );

  if (insertError) throw new Error(insertError.message);
  return { created: toInsert.length };
}
