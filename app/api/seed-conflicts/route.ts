/**
 * One-time seed: insert 10 hardcoded test conflict events (status=Published) with lat/lon and sources.
 * Protected by INGEST_API_KEY (same as /api/internal/ingest). Run once to get >20 events with coords for map/API.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { getOrCreateSourceByDomain } from "@/app/api/_lib/getOrCreateSourceByDomain";
import { normalizeDomainFromUrl } from "@/lib/domain";
import { unauthorized, internalError } from "@/lib/apiError";

const INGEST_API_KEY = process.env.INGEST_API_KEY;
const FEED_KEY = "manual_test";

type SeedEvent = {
  title: string;
  summary: string;
  category: string;
  subtype: string | null;
  severity: string;
  confidence_level: string;
  primary_location: string;
  country_code: string | null;
  source_url: string;
  source_name: string;
};

const SEED_EVENTS: SeedEvent[] = [
  ...Array.from({ length: 5 }, (_, i) => ({
    title: "Russian forces advance near Kharkiv",
    summary:
      "Multiple corroborating reports of military engagement from Ukrainian and international media. High confidence due to ACLED verification and geo-tagged incident data.",
    category: "Armed Conflict",
    subtype: "Battle" as string | null,
    severity: "High",
    confidence_level: "High",
    primary_location: "49.99,36.23",
    country_code: "UA",
    source_url: "https://acleddata.com/ukraine-conflict-events",
    source_name: "ACLED",
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    title: "Iran-backed militia strike",
    summary:
      "Cross-border strike reported by regional monitors. Tension event; confidence medium pending further verification.",
    category: "Political Tension",
    subtype: "Protest" as string | null,
    severity: "Medium",
    confidence_level: "Medium",
    primary_location: "33.3,35.5",
    country_code: null,
    source_url: "https://acleddata.com/middle-east",
    source_name: "ACLED",
  })),
  ...Array.from({ length: 2 }, (_, i) => ({
    title: "Airstrike reported in Gaza City",
    summary:
      "Multiple corroborating reports of airstrike from regional and international media. High confidence due to ACLED verification.",
    category: "Armed Conflict",
    subtype: "Battle" as string | null,
    severity: "High",
    confidence_level: "High",
    primary_location: "31.5,34.45",
    country_code: "PS",
    source_url: "https://acleddata.com/gaza-events",
    source_name: "ACLED",
  })),
];

function last7DaysIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * 7));
  return d.toISOString();
}

export async function POST(request: NextRequest) {
  if (!INGEST_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "Seed not configured: INGEST_API_KEY missing" },
      { status: 503 }
    );
  }
  const key = request.headers.get("x-ingest-key");
  if (key !== INGEST_API_KEY) {
    return unauthorized("Invalid or missing x-ingest-key");
  }

  const inserted: string[] = [];
  try {
    for (const ev of SEED_EVENTS) {
      const domain = normalizeDomainFromUrl(ev.source_url);
      const source =
        domain &&
        (await getOrCreateSourceByDomain(domain, {
          name: ev.source_name,
          url: ev.source_url,
          reliability_tier: "High",
          ecosystem_key: null,
          source_type: "Other",
        }));
      if (!source) continue;

      const { data: event, error: insertErr } = await supabaseAdmin
        .from("events")
        .insert({
          title: ev.title,
          summary: ev.summary,
          details: null,
          category: ev.category,
          subtype: ev.subtype,
          primary_classification: "Verified Event",
          secondary_classification: null,
          severity: ev.severity,
          confidence_level: ev.confidence_level,
          confidence_score: null,
          status: "Published",
          created_by: null,
          requires_dual_review: false,
          occurred_at: last7DaysIso(),
          ended_at: null,
          primary_location: ev.primary_location,
          country_code: ev.country_code,
          admin1: null,
          feed_key: FEED_KEY,
          incident_id: null,
          match_score: null,
          suggested_incident_id: null,
        })
        .select("id")
        .single();

      if (insertErr) {
        console.error("[seed-conflicts] insert failed", { title: ev.title, error: insertErr.message });
        continue;
      }
      if (!event?.id) continue;
      inserted.push(event.id);

      await supabaseAdmin.from("event_sources").insert({
        event_id: event.id,
        source_id: source.id,
        claim_url: ev.source_url,
      });
      try {
        await supabaseAdmin.rpc("increment_source_citation_count", { p_source_id: source.id });
      } catch {
        // RPC may not exist in all envs
      }
    }

    return NextResponse.json({
      seeded: inserted.length,
      ids: inserted,
      message: `Inserted ${inserted.length} test events. To count events with coords: SELECT COUNT(*) FROM events WHERE primary_location IS NOT NULL AND status='Published'`,
    });
  } catch (err) {
    console.error("[seed-conflicts] error", err);
    return internalError("Seed failed");
  }
}
