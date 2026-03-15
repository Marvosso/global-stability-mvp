import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { eventsQuerySchema } from "@/app/api/_lib/validation";
import { event_category } from "@/app/api/_lib/enums";
import { rateLimitExceeded, paymentRequired } from "@/lib/apiError";
import { createRequestLogger } from "@/lib/logger";
import { checkEvents } from "@/lib/rateLimitEvents";
import { getApiKeyContextOptional, decrementCreditsAndLogUsage } from "@/lib/apiKey";
import { parsePrimaryLocation } from "@/lib/eventCoordinates";
import { distanceKm } from "@/lib/eventCoordinates";
import type { ApiKeyContextWithCredits } from "@/lib/apiKey";

const EVENTS_CAP_WITH_GEO = 2000;

function getClientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "anonymous";
}

function corsHeaders(origin?: string | null): HeadersInit {
  const allowOrigin = origin && /^https?:\/\//.test(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonWithCors(body: unknown, init: ResponseInit = {}, request?: NextRequest): NextResponse {
  const res = NextResponse.json(body, init);
  const origin = request?.headers.get("origin");
  Object.entries(corsHeaders(origin)).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

type EventRow = {
  id: string;
  title: string | null;
  summary: string | null;
  category: string | null;
  subtype: string | null;
  severity: string | null;
  confidence_level: string | null;
  occurred_at: string | null;
  primary_location: string | null;
  country_code: string | null;
};

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = createRequestLogger({ requestId });

  // Rate limit: 100 req/IP/hour
  const clientKey = getClientKey(request);
  const { allowed, remaining, resetAtMs } = checkEvents(clientKey);
  if (!allowed) {
    const retryAfterSeconds = Math.max(0, (resetAtMs - Date.now()) / 1000);
    const res = rateLimitExceeded(retryAfterSeconds);
    Object.entries(corsHeaders(request.headers.get("origin"))).forEach(([k, v]) =>
      res.headers.set(k, v)
    );
    return res;
  }

  const apiKeyContext: ApiKeyContextWithCredits | null = await getApiKeyContextOptional(request);
  if (apiKeyContext != null && apiKeyContext.creditsRemaining <= 0) {
    const res = paymentRequired("Credits exhausted. Upgrade or wait for monthly reset.");
    Object.entries(corsHeaders(request.headers.get("origin"))).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }

  const parseResult = eventsQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parseResult.success) {
    const msg = parseResult.error.errors.map((e) => e.message).join("; ") || "Invalid query params";
    log.warn("Events query validation failed", { message: msg });
    return jsonWithCors(
      { error: msg, code: "VALIDATION_FAILED" },
      { status: 400 },
      request
    );
  }

  const { limit, offset, since, until, category, country, confidence, lat, lon, radius_km, full_summary } =
    parseResult.data;

  if (full_summary === true) {
    if (!apiKeyContext || (apiKeyContext.tier !== "pro" && apiKeyContext.tier !== "enterprise")) {
      return jsonWithCors(
        { error: "full_summary=true requires a Pro or Enterprise API key", code: "UPGRADE_REQUIRED" },
        { status: 402 },
        request
      );
    }
  }

  let categories: string[] | null = null;
  if (category?.trim()) {
    const parts = category.split(",").map((c) => c.trim()).filter(Boolean);
    const invalid = parts.filter((c) => !(event_category as readonly string[]).includes(c));
    if (invalid.length > 0) {
      return jsonWithCors(
        { error: `Invalid category: ${invalid.join(", ")}`, code: "VALIDATION_FAILED" },
        { status: 400 },
        request
      );
    }
    categories = parts;
  }

  try {
    let query = supabaseAdmin
      .from("events")
      .select(
        "id, title, summary, category, subtype, severity, confidence_level, occurred_at, primary_location, country_code"
      )
      .eq("status", "Published")
      .order("occurred_at", { ascending: false, nullsFirst: false });

    if (since) {
      query = query.gte("occurred_at", `${since}T00:00:00.000Z`);
    }
    if (until) {
      query = query.lte("occurred_at", `${until}T23:59:59.999Z`);
    }
    if (categories != null && categories.length > 0) {
      query = query.in("category", categories);
    }
    if (country?.trim()) {
      query = query.eq("country_code", country.trim().toUpperCase());
    }
    if (confidence) {
      query = query.eq("confidence_level", confidence);
    }

    const hasGeo = lat != null && lon != null && radius_km != null;
    let list: EventRow[];
    let total: number;

    if (hasGeo) {
      const { data: rows, error } = await query.range(0, EVENTS_CAP_WITH_GEO - 1);
      if (error) {
        log.error("Events query failed", { error: error.message });
        return jsonWithCors(
          { error: "Failed to fetch events", code: "INTERNAL_ERROR" },
          { status: 500 },
          request
        );
      }
      list = (rows ?? []) as EventRow[];
      list = list.filter((row) => {
        const coords = parsePrimaryLocation(row.primary_location);
        if (!coords) return false;
        return distanceKm(lat, lon, coords.lat, coords.lng) <= radius_km!;
      });
      total = list.length;
      list = list.slice(offset, offset + limit);
    } else {
      const cols = "id, title, summary, category, subtype, severity, confidence_level, occurred_at, primary_location, country_code";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase builder accepts (columns, { count }) but types are narrow
      const { data: rows, error, count } = await (query as any).select(cols, { count: "exact" }).range(offset, offset + limit - 1);
      if (error) {
        log.error("Events query failed", { error: error.message });
        return jsonWithCors(
          { error: "Failed to fetch events", code: "INTERNAL_ERROR" },
          { status: 500 },
          request
        );
      }
      list = (rows ?? []) as EventRow[];
      total = count ?? list.length;
    }

    const page = list;

    const eventIds = page.map((e) => e.id);
    if (eventIds.length === 0) {
      if (apiKeyContext) {
        await decrementCreditsAndLogUsage(apiKeyContext.keyId, "/api/events", requestId);
      }
      const res = jsonWithCors(
        { data: [], total: 0, next_offset: null },
        { status: 200 },
        request
      );
      res.headers.set("X-RateLimit-Limit", "100");
      res.headers.set("X-RateLimit-Remaining", String(remaining));
      res.headers.set("X-RateLimit-Reset", String(Math.ceil(resetAtMs / 1000)));
      return res;
    }

    const { data: sourceRows, error: sourceError } = await supabaseAdmin
      .from("event_sources")
      .select("event_id, source_id, claim_url")
      .in("event_id", eventIds);

    if (sourceError) {
      log.warn("Event sources fetch failed", { error: sourceError.message });
    }

    const sourcesByEvent = new Map<string, { name: string; url: string | null }[]>();
    if (sourceRows?.length) {
      const links = sourceRows as { event_id: string; source_id: string; claim_url: string | null }[];
      const uniqueSourceIds = [...new Set(links.map((l) => l.source_id).filter(Boolean))];
      const eventToSourceLinks = new Map<string, { source_id: string; claim_url: string | null }[]>();
      for (const link of links) {
        const arr = eventToSourceLinks.get(link.event_id) ?? [];
        arr.push({ source_id: link.source_id, claim_url: link.claim_url });
        eventToSourceLinks.set(link.event_id, arr);
      }
      if (uniqueSourceIds.length > 0) {
        const { data: sources } = await supabaseAdmin
          .from("sources")
          .select("id, name, url")
          .in("id", uniqueSourceIds);
        const sourceMap = new Map(
          (sources ?? []).map((s: { id: string; name: string | null; url: string | null }) => [
            s.id,
            { name: s.name ?? "Unknown", url: s.url ?? null },
          ])
        );
        for (const [eid, linkList] of eventToSourceLinks) {
          const arr = linkList.map(({ source_id: sid, claim_url }) => {
            const s = sourceMap.get(sid);
            return s ? { name: s.name, url: claim_url || s.url } : null;
          }).filter(Boolean) as { name: string; url: string | null }[];
          sourcesByEvent.set(eid, arr);
        }
      }
    }

    const data = page.map((row) => {
      const coords = parsePrimaryLocation(row.primary_location);
      return {
        id: row.id,
        title: row.title ?? "",
        category: row.category ?? "",
        subtype: row.subtype ?? null,
        severity: row.severity ?? "",
        confidence: row.confidence_level ?? null,
        occurred_at: row.occurred_at ?? null,
        lat: coords?.lat ?? null,
        lon: coords?.lng ?? null,
        sources: sourcesByEvent.get(row.id) ?? [],
        summary: row.summary ?? null,
      };
    });

    const next_offset = offset + limit < total ? offset + limit : null;
    if (apiKeyContext) {
      await decrementCreditsAndLogUsage(apiKeyContext.keyId, "/api/events", requestId);
    }
    const res = jsonWithCors({ data, total, next_offset }, { status: 200 }, request);
    res.headers.set("X-RateLimit-Limit", "100");
    res.headers.set("X-RateLimit-Remaining", String(remaining));
    res.headers.set("X-RateLimit-Reset", String(Math.ceil(resetAtMs / 1000)));
    return res;
  } catch (err) {
    log.error("Events handler error", { err });
    return jsonWithCors(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
      request
    );
  }
}
