/**
 * Phase 12E: Weekly intelligence brief generator.
 * Pulls top events by importance, largest negative stability deltas, and new conflicts;
 * builds a structured brief; stores in weekly_briefs; prints a readable report.
 *
 * Run: npm run brief:weekly
 * Env: .env.local — Supabase vars for db.
 */

import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
config({ path: path.join(projectRoot, ".env.local") });

const WINDOW_DAYS = 7;
const TOP_N = 10;

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// --- Brief types (match plan) ---
export type HeadlineEventItem = {
  event_id: string;
  title: string;
  country_code: string | null;
  importance_score: number;
  summary: string | null;
  severity: string;
  category: string;
  occurred_at: string | null;
};

export type RegionalAnalysisItem = {
  region_code: string;
  stability_score: number;
  delta_7d: number | null;
  delta_24h: number | null;
  summary: string;
};

export type HumanitarianAlertItem = {
  event_id: string;
  title: string;
  country_code: string | null;
  severity: string;
  category: string;
  summary: string | null;
  occurred_at: string | null;
};

export type EmergingRiskItem = {
  event_id: string;
  title: string;
  country_code: string | null;
  conflict_summary: string;
};

export type WeeklyBriefJson = {
  headline_events: HeadlineEventItem[];
  regional_analysis: RegionalAnalysisItem[];
  humanitarian_alerts: HumanitarianAlertItem[];
  emerging_risks: EmergingRiskItem[];
};

// --- Importance scoring ---
const SEVERITY_WEIGHT: Record<string, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

function confidenceScore(score: number | null, level: string | null): number {
  if (score != null && !Number.isNaN(score)) return Math.max(0, Math.min(100, score));
  if (level === "High") return 67;
  if (level === "Medium") return 50;
  if (level === "Low") return 33;
  return 50;
}

function recencyFactor(occurredAt: string | null, windowEnd: Date): number {
  if (!occurredAt) return 0.7;
  const t = new Date(occurredAt).getTime();
  const end = windowEnd.getTime();
  const daysAgo = (end - t) / (24 * 60 * 60 * 1000);
  if (daysAgo <= 0) return 1;
  return Math.max(0.5, 1 - 0.08 * daysAgo);
}

function computeImportance(
  event: {
    severity: string;
    confidence_score: number | null;
    confidence_level: string | null;
    occurred_at: string | null;
  },
  windowEnd: Date
): number {
  const sw = SEVERITY_WEIGHT[event.severity] ?? 2;
  const conf = confidenceScore(event.confidence_score, event.confidence_level);
  const rec = recencyFactor(event.occurred_at, windowEnd);
  return sw * (0.5 + conf / 100) * rec;
}

// --- Readable report ---
function printReport(brief: WeeklyBriefJson, weekEnding: string): void {
  const lines: string[] = [
    "",
    "# Weekly Intelligence Brief",
    `Week ending: ${weekEnding}`,
    "",
    "---",
    "",
    "## Headline events",
    "",
  ];
  for (const e of brief.headline_events) {
    const loc = e.country_code ? ` (${e.country_code})` : "";
    const occ = e.occurred_at ? ` — ${e.occurred_at.slice(0, 10)}` : "";
    lines.push(`- **${e.title}**${loc}${occ} — importance ${e.importance_score.toFixed(1)}`);
    if (e.summary) lines.push(`  ${e.summary.slice(0, 200)}${e.summary.length > 200 ? "…" : ""}`);
  }
  lines.push("", "## Regional analysis (largest negative stability deltas)", "");
  for (const r of brief.regional_analysis) {
    lines.push(`- **${r.region_code}**: ${r.summary}`);
  }
  lines.push("", "## Humanitarian alerts", "");
  for (const a of brief.humanitarian_alerts) {
    const loc = a.country_code ? ` (${a.country_code})` : "";
    lines.push(`- **${a.title}**${loc} — ${a.severity} / ${a.category}`);
    if (a.summary) lines.push(`  ${a.summary.slice(0, 200)}${a.summary.length > 200 ? "…" : ""}`);
  }
  lines.push("", "## Emerging risks (events with contradicting claims)", "");
  for (const r of brief.emerging_risks) {
    const loc = r.country_code ? ` (${r.country_code})` : "";
    lines.push(`- **${r.title}**${loc} — ${r.conflict_summary}`);
  }
  lines.push("", "---", "");
  console.log(lines.join("\n"));
}

async function main(): Promise<number> {
  const { supabaseAdmin } = await import("@/app/api/_lib/db");

  const now = new Date();
  const todayDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const windowEnd = new Date(todayDate);
  const windowStart = new Date(todayDate);
  windowStart.setUTCDate(windowStart.getUTCDate() - WINDOW_DAYS);
  const weekEndingStr = toDateString(windowEnd);
  const windowStartStr = windowStart.toISOString();
  const windowEndStr = new Date(windowEnd.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString();

  console.log(`Generating weekly brief for week ending ${weekEndingStr} (last ${WINDOW_DAYS} days).`);

  // 1) Top events by computed importance (Published, occurred_at in window)
  const { data: eventRows, error: eventsError } = await supabaseAdmin
    .from("events")
    .select(
      "id, title, summary, country_code, severity, category, occurred_at, confidence_score, confidence_level"
    )
    .eq("status", "Published")
    .gte("occurred_at", windowStartStr)
    .lte("occurred_at", windowEndStr);

  if (eventsError) {
    console.error("Failed to fetch events:", eventsError.message);
    return 1;
  }

  type EventRow = {
    id: string;
    title: string | null;
    summary: string | null;
    country_code: string | null;
    severity: string;
    category: string;
    occurred_at: string | null;
    confidence_score: number | null;
    confidence_level: string | null;
  };

  const events = (eventRows ?? []) as EventRow[];
  const withImportance = events.map((e) => ({
    ...e,
    importance_score: computeImportance(e, windowEnd),
  }));
  withImportance.sort((a, b) => b.importance_score - a.importance_score);
  const headlineEvents: HeadlineEventItem[] = withImportance.slice(0, TOP_N).map((e) => ({
    event_id: e.id,
    title: e.title ?? "Untitled",
    country_code: e.country_code ?? null,
    importance_score: Math.round(e.importance_score * 100) / 100,
    summary: e.summary ?? null,
    severity: e.severity,
    category: e.category,
    occurred_at: e.occurred_at ?? null,
  }));

  // 2) Largest negative stability deltas (latest as_of_date, country-level, exclude global)
  const { data: latestDateRow, error: latestError } = await supabaseAdmin
    .from("region_scores")
    .select("as_of_date")
    .eq("region_type", "country")
    .order("as_of_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  let regionalAnalysis: RegionalAnalysisItem[] = [];
  if (!latestError && latestDateRow?.as_of_date) {
    const latestDate = String(latestDateRow.as_of_date);
    const { data: deltaRows, error: deltaError } = await supabaseAdmin
      .from("region_scores")
      .select("region_code, stability_score, delta_7d, delta_24h")
      .eq("region_type", "country")
      .eq("as_of_date", latestDate)
      .neq("region_code", "global")
      .or("delta_7d.lt.0,delta_24h.lt.0");

    if (!deltaError && deltaRows?.length) {
      const withDelta = (deltaRows as Array<{ region_code: string; stability_score: number; delta_7d: number | null; delta_24h: number | null }>)
        .map((r) => ({
          ...r,
          delta_7d: r.delta_7d != null ? Number(r.delta_7d) : null,
          delta_24h: r.delta_24h != null ? Number(r.delta_24h) : null,
          sortDelta: r.delta_7d != null ? Number(r.delta_7d) : r.delta_24h != null ? Number(r.delta_24h) : 0,
        }))
        .filter((r) => r.sortDelta < 0)
        .sort((a, b) => a.sortDelta - b.sortDelta)
        .slice(0, TOP_N);
      regionalAnalysis = withDelta.map((r) => ({
        region_code: r.region_code,
        stability_score: Number(r.stability_score),
        delta_7d: r.delta_7d,
        delta_24h: r.delta_24h,
        summary:
          r.delta_7d != null
            ? `Stability down ${Math.abs(r.delta_7d).toFixed(1)} points in the past 7 days.`
            : r.delta_24h != null
              ? `Stability down ${Math.abs(r.delta_24h).toFixed(1)} points in the past 24h.`
              : "Stability decline.",
      }));
    }
  }

  // 3) Humanitarian alerts: high severity or Natural Disaster
  const humanitarianAlerts: HumanitarianAlertItem[] = events
    .filter(
      (e) =>
        e.severity === "Critical" ||
        e.severity === "High" ||
        e.category === "Natural Disaster"
    )
    .slice(0, TOP_N)
    .map((e) => ({
      event_id: e.id,
      title: e.title ?? "Untitled",
      country_code: e.country_code ?? null,
      severity: e.severity,
      category: e.category,
      summary: e.summary ?? null,
      occurred_at: e.occurred_at ?? null,
    }));

  // 4) Emerging risks: events in window that have at least one claim_conflict
  const eventIdsInWindow = new Set(events.map((e) => e.id));
  const eventIdsWithConflicts = new Set<string>();
  if (eventIdsInWindow.size > 0) {
    const { data: conflictRows, error: conflictError } = await supabaseAdmin
      .from("claim_conflicts")
      .select("event_id")
      .in("event_id", Array.from(eventIdsInWindow));

    if (!conflictError && conflictRows?.length) {
      for (const r of conflictRows as { event_id: string }[]) {
        eventIdsWithConflicts.add(r.event_id);
      }
    } else if (conflictError) {
      console.warn("Failed to fetch claim_conflicts:", conflictError.message);
    }
  }

  const emergingRisks: EmergingRiskItem[] = events
    .filter((e) => eventIdsWithConflicts.has(e.id))
    .slice(0, TOP_N)
    .map((e) => ({
      event_id: e.id,
      title: e.title ?? "Untitled",
      country_code: e.country_code ?? null,
      conflict_summary: "Contradicting claims detected.",
    }));

  const brief: WeeklyBriefJson = {
    headline_events: headlineEvents,
    regional_analysis: regionalAnalysis,
    humanitarian_alerts: humanitarianAlerts,
    emerging_risks: emergingRisks,
  };

  // 5) Upsert weekly_briefs
  const { error: upsertError } = await supabaseAdmin.from("weekly_briefs").upsert(
    {
      week_ending: weekEndingStr,
      brief_json: brief,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "week_ending" }
  );

  if (upsertError) {
    console.error("Failed to upsert weekly_briefs:", upsertError.message);
    return 1;
  }

  console.log(`Stored brief in weekly_briefs (week_ending=${weekEndingStr}).`);

  // 6) Readable report
  printReport(brief, weekEndingStr);

  console.log("Weekly brief generation complete.");
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
