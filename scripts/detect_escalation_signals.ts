/**
 * Phase 14B: Escalation signal detection.
 * Analyzes last 7 days of published events (and prior windows), detects regions
 * meeting threshold-based rules (protest spike >200%, conflict escalation >50%),
 * and inserts records into escalation_indicators.
 *
 * Run: npm run detect:escalation
 * Env: .env.local — Supabase vars for db.
 */

import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import { getRegionKey, REGION_KEY_UNKNOWN } from "@/lib/regionKey";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
config({ path: path.join(projectRoot, ".env.local") });

// --- Thresholds ---
const PROTEST_INCREASE_RATIO = 2; // 200% increase = 2x
const PROTEST_MIN_CURRENT_WHEN_ZERO_PREV = 3;
const CONFLICT_INCREASE_RATIO = 1.5; // 50% increase
const CONFLICT_MIN_CURRENT_WHEN_ZERO_PREV = 2;

const PROTEST_CURRENT_DAYS = 3;
const PROTEST_PREVIOUS_DAYS = 3;
const CONFLICT_CURRENT_DAYS = 7;
const CONFLICT_PREVIOUS_DAYS = 7;
const TOTAL_EVENT_DAYS = 14; // last 14 days to cover both conflict windows

type EventRow = {
  id: string;
  country_code: string | null;
  primary_location: string | null;
  category: string;
  subtype: string | null;
  occurred_at: string | null;
};

type RegionCounts = { current: number; previous: number };

type IndicatorToInsert = {
  region_code: string;
  indicator_type: "protest_spike" | "conflict_escalation";
  score: number;
  description: string;
};

async function main(): Promise<number> {
  const { supabaseAdmin } = await import("@/app/api/_lib/db");

  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const endOfToday = new Date(todayUtc);
  endOfToday.setUTCHours(23, 59, 59, 999);

  // Windows (UTC): last 3 days, previous 3 days, last 7 days, previous 7 days
  const windowStart = new Date(todayUtc);
  windowStart.setUTCDate(windowStart.getUTCDate() - TOTAL_EVENT_DAYS);
  const windowStartStr = windowStart.toISOString();
  const windowEndStr = endOfToday.toISOString();

  const last3Start = new Date(todayUtc);
  last3Start.setUTCDate(last3Start.getUTCDate() - PROTEST_CURRENT_DAYS);
  const prev3Start = new Date(todayUtc);
  prev3Start.setUTCDate(prev3Start.getUTCDate() - PROTEST_CURRENT_DAYS - PROTEST_PREVIOUS_DAYS);
  const last7Start = new Date(todayUtc);
  last7Start.setUTCDate(last7Start.getUTCDate() - CONFLICT_CURRENT_DAYS);
  const prev7Start = new Date(todayUtc);
  prev7Start.setUTCDate(prev7Start.getUTCDate() - CONFLICT_CURRENT_DAYS - CONFLICT_PREVIOUS_DAYS);

  const last3StartTs = last3Start.getTime();
  const prev3EndTs = last3StartTs - 1;
  const prev3StartTs = prev3Start.getTime();
  const last7StartTs = last7Start.getTime();
  const prev7EndTs = last7StartTs - 1;
  const prev7StartTs = prev7Start.getTime();

  const { data: eventRows, error: eventsError } = await supabaseAdmin
    .from("events")
    .select("id, country_code, primary_location, category, subtype, occurred_at")
    .eq("status", "Published")
    .gte("occurred_at", windowStartStr)
    .lte("occurred_at", windowEndStr);

  if (eventsError) {
    console.error("Failed to fetch events:", eventsError.message);
    return 1;
  }

  const events = (eventRows ?? []) as EventRow[];
  const withRegion: (EventRow & { region_key: string })[] = [];
  for (const e of events) {
    const region_key = getRegionKey(e.country_code, e.primary_location);
    if (region_key === REGION_KEY_UNKNOWN) continue;
    withRegion.push({ ...e, region_key });
  }

  console.log(
    `Loaded ${events.length} Published events (${withRegion.length} with region) in last ${TOTAL_EVENT_DAYS} days.`
  );

  const protestByRegion = new Map<string, RegionCounts>();
  const conflictByRegion = new Map<string, RegionCounts>();

  for (const e of withRegion) {
    const ts = e.occurred_at ? new Date(e.occurred_at).getTime() : 0;
    if (ts === 0) continue;

    const key = e.region_key;

    if (e.category === "Political Tension" && e.subtype === "Protest") {
      let p = protestByRegion.get(key);
      if (!p) {
        p = { current: 0, previous: 0 };
        protestByRegion.set(key, p);
      }
      if (ts >= last3StartTs) p.current += 1;
      else if (ts >= prev3StartTs && ts <= prev3EndTs) p.previous += 1;
    }

    if (e.category === "Armed Conflict") {
      let c = conflictByRegion.get(key);
      if (!c) {
        c = { current: 0, previous: 0 };
        conflictByRegion.set(key, c);
      }
      if (ts >= last7StartTs) c.current += 1;
      else if (ts >= prev7StartTs && ts <= prev7EndTs) c.previous += 1;
    }
  }

  const indicators: IndicatorToInsert[] = [];

  for (const [region_code, counts] of protestByRegion) {
    const { current, previous } = counts;
    const trigger =
      previous > 0
        ? current > previous * PROTEST_INCREASE_RATIO
        : current >= PROTEST_MIN_CURRENT_WHEN_ZERO_PREV;
    if (!trigger) continue;
    const pct =
      previous === 0 ? 100 : Math.round((current / previous) * 100);
    const description =
      previous === 0
        ? `Protest events: ${current} in last ${PROTEST_CURRENT_DAYS} days (0 in previous ${PROTEST_PREVIOUS_DAYS} days).`
        : `Protest events increased ${pct}% vs previous ${PROTEST_PREVIOUS_DAYS} days (${current} vs ${previous}).`;
    indicators.push({
      region_code,
      indicator_type: "protest_spike",
      score: pct,
      description,
    });
  }

  for (const [region_code, counts] of conflictByRegion) {
    const { current, previous } = counts;
    const trigger =
      previous > 0
        ? current > previous * CONFLICT_INCREASE_RATIO
        : current >= CONFLICT_MIN_CURRENT_WHEN_ZERO_PREV;
    if (!trigger) continue;
    const pct =
      previous === 0 ? 100 : Math.round((current / previous) * 100);
    const description =
      previous === 0
        ? `Armed conflict events: ${current} in last ${CONFLICT_CURRENT_DAYS} days (0 in previous week).`
        : `Armed conflict events increased ${pct}% week-over-week (${current} vs ${previous}).`;
    indicators.push({
      region_code,
      indicator_type: "conflict_escalation",
      score: pct,
      description,
    });
  }

  if (indicators.length === 0) {
    console.log("No escalation indicators met thresholds.");
    return 0;
  }

  const rows = indicators.map((ind) => ({
    region_code: ind.region_code,
    indicator_type: ind.indicator_type,
    score: ind.score,
    description: ind.description,
    detected_at: new Date().toISOString(),
  }));

  const { error: insertError } = await supabaseAdmin
    .from("escalation_indicators")
    .insert(rows);

  if (insertError) {
    console.error("Failed to insert escalation_indicators:", insertError.message);
    return 1;
  }

  console.log(`Inserted ${rows.length} escalation indicator(s).`);
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
