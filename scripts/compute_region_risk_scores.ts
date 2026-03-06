/**
 * Phase 14C: Compute region escalation risk scores.
 * Aggregates escalation_indicators by region with type-based weights,
 * computes risk_score (0-100), maps to risk_level, and upserts into region_risk_scores.
 *
 * Run: npm run score:risk
 * Env: .env.local — Supabase vars for db.
 */

import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
config({ path: path.join(projectRoot, ".env.local") });

const WINDOW_DAYS = 14;

/** Weight per indicator type (tune as needed). Higher = more impact on risk. */
const INDICATOR_WEIGHTS: Record<string, number> = {
  protest_spike: 1,
  conflict_escalation: 1.5,
  humanitarian_deterioration: 1.2,
  disaster_spillover: 1.2,
  cross_border_incident: 1.3,
};

const DEFAULT_INDICATOR_SCORE = 50;
/** Divide raw weighted sum by this to get 0-100 scale. */
const RISK_SCORE_SCALE = 5;

/** risk_score bands for risk_level (0-100 scale). */
const RISK_LEVEL_BANDS = [
  { max: 25, level: "Low" as const },
  { max: 50, level: "Medium" as const },
  { max: 75, level: "High" as const },
  { max: 100, level: "Critical" as const },
];

type IndicatorRow = {
  id: string;
  region_code: string;
  indicator_type: string;
  score: number | null;
  detected_at: string;
};

function getWeight(indicatorType: string): number {
  return INDICATOR_WEIGHTS[indicatorType] ?? 1;
}

function scoreToRiskLevel(score: number): "Low" | "Medium" | "High" | "Critical" {
  const capped = Math.max(0, Math.min(100, score));
  for (const band of RISK_LEVEL_BANDS) {
    if (capped <= band.max) return band.level;
  }
  return "Critical";
}

async function main(): Promise<number> {
  const { supabaseAdmin } = await import("@/app/api/_lib/db");

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);
  const windowStartStr = windowStart.toISOString();

  const { data: rows, error } = await supabaseAdmin
    .from("escalation_indicators")
    .select("id, region_code, indicator_type, score, detected_at")
    .gte("detected_at", windowStartStr);

  if (error) {
    console.error("Failed to fetch escalation_indicators:", error.message);
    return 1;
  }

  const indicators = (rows ?? []) as IndicatorRow[];
  console.log(
    `Loaded ${indicators.length} escalation indicator(s) in last ${WINDOW_DAYS} days.`
  );

  const byRegion = new Map<
    string,
    { weightedSum: number }
  >();

  for (const ind of indicators) {
    const weight = getWeight(ind.indicator_type);
    const score = ind.score != null ? Number(ind.score) : DEFAULT_INDICATOR_SCORE;
    const contribution = weight * score;

    let cur = byRegion.get(ind.region_code);
    if (!cur) {
      cur = { weightedSum: 0 };
      byRegion.set(ind.region_code, cur);
    }
    cur.weightedSum += contribution;
  }

  const toUpsert: Array<{
    region_code: string;
    risk_score: number;
    risk_level: string;
    computed_at: string;
  }> = [];

  for (const [region_code, { weightedSum }] of byRegion) {
    const risk_score = Math.min(
      100,
      Math.round((weightedSum / RISK_SCORE_SCALE) * 100) / 100
    );
    const risk_level = scoreToRiskLevel(risk_score);
    toUpsert.push({
      region_code,
      risk_score,
      risk_level,
      computed_at: new Date().toISOString(),
    });
  }

  if (toUpsert.length === 0) {
    console.log("No regions with indicators in window; nothing to upsert.");
    return 0;
  }

  const { error: upsertError } = await supabaseAdmin
    .from("region_risk_scores")
    .upsert(toUpsert, {
      onConflict: "region_code",
      ignoreDuplicates: false,
    });

  if (upsertError) {
    console.error("Failed to upsert region_risk_scores:", upsertError.message);
    return 1;
  }

  console.log(`Upserted ${toUpsert.length} region risk score(s).`);
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
