/**
 * Admin-only: backfill events.lat / events.lon from primary_location, country_code, or title heuristics.
 * POST /api/backfill-geo — requires Supabase session with Admin role (Authorization: Bearer or cookie).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { resolveCoordsForBackfill } from "@/lib/geoResolve";
import { forbidden, internalError, unauthorized } from "@/lib/apiError";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 401) return unauthorized();
    if (status === 403) return forbidden("Admin only");
    throw err;
  }

  const { data: rows, error } = await supabaseAdmin
    .from("events")
    .select("id, title, summary, primary_location, country_code, confidence_level")
    .eq("status", "Published")
    .is("lat", null)
    .limit(5000);

  if (error) {
    console.error("[backfill-geo]", error.message);
    return internalError("Failed to load events");
  }

  let updated = 0;
  for (const row of rows ?? []) {
    const resolved = resolveCoordsForBackfill({
      title: row.title,
      summary: row.summary,
      primary_location: row.primary_location,
      country_code: row.country_code,
    });
    if (!resolved) continue;

    const update: Record<string, unknown> = {
      lat: resolved.lat,
      lon: resolved.lon,
    };
    if (!(row.primary_location ?? "").trim()) {
      update.primary_location = resolved.primary_location;
    }
    if (resolved.approximated) {
      update.confidence_level = "Low";
    }

    const { error: upErr } = await supabaseAdmin.from("events").update(update).eq("id", row.id);
    if (!upErr) updated += 1;
  }

  return NextResponse.json({
    updated,
    scanned: (rows ?? []).length,
    message:
      "Published rows with lat IS NULL were scanned (max 5000 per run). Re-run to process more if needed.",
    verification_sql: `SELECT 
  COUNT(*) AS total_published,
  COUNT(CASE WHEN lat IS NOT NULL AND lon IS NOT NULL THEN 1 END) AS with_geo,
  COUNT(CASE WHEN category ILIKE '%conflict%' OR category ILIKE '%tension%' THEN 1 END) AS conflict_events
FROM events 
WHERE status = 'Published' 
AND occurred_at > NOW() - INTERVAL '14 days';`,
  });
}
