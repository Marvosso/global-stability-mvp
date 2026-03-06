import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { createRequestLogger } from "@/lib/logger";
import { internalError } from "@/lib/apiError";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;
const EVENT_DRIVERS_HOURS = 72;

export type HeatingUpCountry = {
  country_code: string;
  stability_score: number;
  delta_24h: number | null;
};

export type HeatingUpEventDriver = {
  id: string;
  title: string | null;
  country_code: string | null;
  severity: string;
  category: string;
  occurred_at: string | null;
};

export type HeatingUpResponse = {
  countries: HeatingUpCountry[];
  eventDrivers: HeatingUpEventDriver[];
};

const SEVERITY_ORDER: Record<string, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

function severityRank(s: string): number {
  return SEVERITY_ORDER[s] ?? 0;
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = createRequestLogger({ requestId });

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || DEFAULT_LIMIT)
  );

  const since = new Date(Date.now() - EVENT_DRIVERS_HOURS * 60 * 60 * 1000).toISOString();

  const [latestRes, eventsRes] = await Promise.all([
    supabaseAdmin
      .from("region_scores")
      .select("as_of_date")
      .eq("region_type", "country")
      .order("as_of_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("events")
      .select("id, title, country_code, severity, category, occurred_at")
      .eq("status", "Published")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(500),
  ]);

  if (latestRes.error) {
    log.error("Heating-up latest score date failed", { error: latestRes.error.message });
    return internalError(latestRes.error.message);
  }

  let countries: HeatingUpCountry[] = [];
  if (latestRes.data?.as_of_date) {
    const latestDate = String(latestRes.data.as_of_date);
    const withDate = await supabaseAdmin
      .from("region_scores")
      .select("region_code, stability_score, delta_24h")
      .eq("region_type", "country")
      .eq("as_of_date", latestDate)
      .neq("region_code", "global")
      .not("delta_24h", "is", null)
      .lt("delta_24h", 0)
      .order("delta_24h", { ascending: true })
      .limit(limit);

    if (withDate.error) {
      log.error("Heating-up countries query failed", { error: withDate.error.message });
      return internalError(withDate.error.message);
    }
    countries = (withDate.data ?? []).map((r: { region_code: string; stability_score: number; delta_24h: number | null }) => ({
      country_code: r.region_code,
      stability_score: Number(r.stability_score),
      delta_24h: r.delta_24h != null ? Number(r.delta_24h) : null,
    }));
  }

  let eventDrivers: HeatingUpEventDriver[] = [];
  if (eventsRes.error) {
    log.error("Heating-up event drivers query failed", { error: eventsRes.error.message });
    return internalError(eventsRes.error.message);
  }
  const events = (eventsRes.data ?? []) as Array<{
    id: string;
    title: string | null;
    country_code: string | null;
    severity: string;
    category: string;
    occurred_at: string | null;
  }>;
  eventDrivers = events
    .sort((a, b) => {
      const sa = severityRank(a.severity);
      const sb = severityRank(b.severity);
      if (sb !== sa) return sb - sa;
      const ta = a.occurred_at ? new Date(a.occurred_at).getTime() : 0;
      const tb = b.occurred_at ? new Date(b.occurred_at).getTime() : 0;
      return tb - ta;
    })
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      title: e.title ?? null,
      country_code: e.country_code ?? null,
      severity: e.severity,
      category: e.category,
      occurred_at: e.occurred_at ?? null,
    }));

  log.info("Heating-up summary", { countriesCount: countries.length, eventDriversCount: eventDrivers.length });
  return NextResponse.json({ countries, eventDrivers });
}
