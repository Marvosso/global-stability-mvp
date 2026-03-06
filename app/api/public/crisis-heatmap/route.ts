import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { createRequestLogger } from "@/lib/logger";
import { internalError } from "@/lib/apiError";
import { parsePrimaryLocation } from "@/lib/eventCoordinates";

/**
 * GET /api/public/crisis-heatmap
 * Returns point-based data for Mapbox heatmap layer: lat, lng, intensity, category.
 * Intensity = severity_weight + importance_score (event-based).
 * No auth required.
 */

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

function recencyFactor(occurredAt: string | null, asOf: Date): number {
  if (!occurredAt) return 0.7;
  const t = new Date(occurredAt).getTime();
  const end = asOf.getTime();
  const daysAgo = (end - t) / (24 * 60 * 60 * 1000);
  if (daysAgo <= 0) return 1;
  return Math.max(0.5, 1 - 0.08 * daysAgo);
}

/** Importance 0–~6 scale; normalize to 0–10 for intensity. */
function importanceScore(
  event: {
    severity: string;
    confidence_score: number | null;
    confidence_level: string | null;
    occurred_at: string | null;
  },
  asOf: Date
): number {
  const sw = SEVERITY_WEIGHT[event.severity] ?? 2;
  const conf = confidenceScore(event.confidence_score, event.confidence_level);
  const rec = recencyFactor(event.occurred_at, asOf);
  const raw = sw * (0.5 + conf / 100) * rec;
  return Math.min(10, Math.max(0, (raw / 6) * 10));
}

export type CrisisHeatmapPoint = {
  lat: number;
  lng: number;
  intensity: number;
  category: string;
};

const MAX_EVENTS = 500;

export async function GET(_request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = createRequestLogger({ requestId });

  const { data: rows, error } = await supabaseAdmin
    .from("events")
    .select("primary_location, severity, confidence_score, confidence_level, occurred_at, category")
    .eq("status", "Published")
    .not("primary_location", "is", null)
    .limit(MAX_EVENTS);

  if (error) {
    log.error("Crisis heatmap events query failed", { error: error.message });
    return internalError(error.message);
  }

  const asOf = new Date();
  const points: CrisisHeatmapPoint[] = [];

  for (const row of rows ?? []) {
    const parsed = parsePrimaryLocation(row.primary_location as string);
    if (!parsed) continue;

    const severityWeight = SEVERITY_WEIGHT[String(row.severity)] ?? 2;
    const importance = importanceScore(
      {
        severity: String(row.severity),
        confidence_score: row.confidence_score != null ? Number(row.confidence_score) : null,
        confidence_level: row.confidence_level != null ? String(row.confidence_level) : null,
        occurred_at: row.occurred_at != null ? String(row.occurred_at) : null,
      },
      asOf
    );
    const intensity = severityWeight + importance;

    points.push({
      lat: parsed.lat,
      lng: parsed.lng,
      intensity: Math.round(intensity * 100) / 100,
      category: String(row.category ?? ""),
    });
  }

  log.info("Public crisis-heatmap listed", { count: points.length });
  return NextResponse.json(points);
}
