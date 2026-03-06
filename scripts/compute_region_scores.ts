/**
 * Phase 10D: Daily scoring job.
 * Pulls Published events from the last 7 days, computes stability scores by country (and global),
 * computes delta_24h/delta_7d vs prior region_scores, upserts into region_scores and score_components.
 *
 * Run: npm run score:daily
 * Env: .env.local — Supabase vars for db.
 */

import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import {
  computeStabilityScores,
  type EventForStability,
} from "@/lib/scoring/stability";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
config({ path: path.join(projectRoot, ".env.local") });

const WINDOW_DAYS = 7;
const REGION_TYPE = "country";

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<number> {
  const { supabaseAdmin } = await import("@/app/api/_lib/db");

  const now = new Date();
  const todayDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endOfToday = new Date(todayDate);
  endOfToday.setUTCHours(23, 59, 59, 999);

  const today = toDateString(todayDate);
  const windowStart = new Date(todayDate);
  windowStart.setUTCDate(windowStart.getUTCDate() - WINDOW_DAYS);
  const yesterdayDate = new Date(todayDate);
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const todayMinus7Date = new Date(todayDate);
  todayMinus7Date.setUTCDate(todayMinus7Date.getUTCDate() - 7);
  const yesterday = toDateString(yesterdayDate);
  const todayMinus7 = toDateString(todayMinus7Date);

  const windowStartStr = windowStart.toISOString();
  const windowEndStr = endOfToday.toISOString();

  const { data: eventRows, error: eventsError } = await supabaseAdmin
    .from("events")
    .select("severity, category, confidence_level, occurred_at, country_code, primary_location")
    .eq("status", "Published")
    .gte("occurred_at", windowStartStr)
    .lte("occurred_at", windowEndStr);

  if (eventsError) {
    console.error("Failed to fetch events:", eventsError.message);
    return 1;
  }

  const events: EventForStability[] = (eventRows ?? []).map((row: Record<string, unknown>) => ({
    severity: String(row.severity ?? "Medium"),
    category: String(row.category ?? ""),
    confidence_level: row.confidence_level != null ? String(row.confidence_level) : null,
    occurred_at: row.occurred_at != null ? String(row.occurred_at) : null,
    country_code: row.country_code != null ? String(row.country_code) : null,
    primary_location: row.primary_location != null ? String(row.primary_location) : null,
  }));

  console.log(`Loaded ${events.length} Published events (window: last ${WINDOW_DAYS} days).`);

  const { byCountry, global: globalScore } = computeStabilityScores(events, {
    asOfDate: endOfToday,
    windowDays: WINDOW_DAYS,
  });

  const { data: priorRows, error: priorError } = await supabaseAdmin
    .from("region_scores")
    .select("region_code, as_of_date, stability_score")
    .eq("region_type", REGION_TYPE)
    .in("as_of_date", [yesterday, todayMinus7]);

  if (priorError) {
    console.error("Failed to fetch prior region_scores:", priorError.message);
    return 1;
  }

  type Prior = { score_24h?: number; score_7d?: number };
  const priorByRegion = new Map<string, Prior>();
  for (const row of priorRows ?? []) {
    const code = String(row.region_code);
    const score = Number(row.stability_score);
    const asOf = String(row.as_of_date);
    let p = priorByRegion.get(code);
    if (!p) {
      p = {};
      priorByRegion.set(code, p);
    }
    if (asOf === yesterday) p.score_24h = score;
    if (asOf === todayMinus7) p.score_7d = score;
  }

  const regionScoreRows: Array<{
    region_type: string;
    region_code: string;
    as_of_date: string;
    stability_score: number;
    delta_24h: number | null;
    delta_7d: number | null;
    computed_at: string;
  }> = [];
  const computedAt = new Date().toISOString();

  for (const [regionCode, score] of Object.entries(byCountry)) {
    const prior = priorByRegion.get(regionCode);
    const delta_24h =
      prior?.score_24h != null ? Math.round((score - prior.score_24h) * 100) / 100 : null;
    const delta_7d =
      prior?.score_7d != null ? Math.round((score - prior.score_7d) * 100) / 100 : null;
    regionScoreRows.push({
      region_type: REGION_TYPE,
      region_code: regionCode,
      as_of_date: today,
      stability_score: score,
      delta_24h,
      delta_7d,
      computed_at: computedAt,
    });
  }

  const priorGlobal = priorByRegion.get("global");
  const delta24Global =
    priorGlobal?.score_24h != null
      ? Math.round((globalScore - priorGlobal.score_24h) * 100) / 100
      : null;
  const delta7Global =
    priorGlobal?.score_7d != null
      ? Math.round((globalScore - priorGlobal.score_7d) * 100) / 100
      : null;
  regionScoreRows.push({
    region_type: REGION_TYPE,
    region_code: "global",
    as_of_date: today,
    stability_score: globalScore,
    delta_24h: delta24Global,
    delta_7d: delta7Global,
    computed_at: computedAt,
  });

  const { error: upsertError } = await supabaseAdmin
    .from("region_scores")
    .upsert(regionScoreRows, {
      onConflict: "region_type,region_code,as_of_date",
      ignoreDuplicates: false,
    });

  if (upsertError) {
    console.error("Failed to upsert region_scores:", upsertError.message);
    return 1;
  }

  console.log(`Upserted ${regionScoreRows.length} region_scores (as_of_date=${today}).`);

  const { data: insertedScores, error: selectError } = await supabaseAdmin
    .from("region_scores")
    .select("id, region_code, stability_score")
    .eq("region_type", REGION_TYPE)
    .eq("as_of_date", today);

  if (selectError) {
    console.error("Failed to select region_scores after upsert:", selectError.message);
    return 1;
  }

  for (const row of insertedScores ?? []) {
    const id = row.id;
    const { error: delError } = await supabaseAdmin
      .from("score_components")
      .delete()
      .eq("region_score_id", id);

    if (delError) {
      console.warn(`Failed to delete old score_components for ${id}:`, delError.message);
    }

    const { error: insError } = await supabaseAdmin.from("score_components").insert({
      region_score_id: id,
      component: "stability",
      value: row.stability_score,
      notes: "v1",
    });

    if (insError) {
      console.warn(`Failed to insert score_component for ${id}:`, insError.message);
    }
  }

  console.log(`Wrote score_components for ${insertedScores?.length ?? 0} region_scores.`);
  console.log("Daily scoring complete.");
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
