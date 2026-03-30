import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/api/_lib/db";
import { clustersQuerySchema } from "@/app/api/_lib/validation";
import { event_category } from "@/app/api/_lib/enums";
import { rateLimitExceeded } from "@/lib/apiError";
import { createRequestLogger } from "@/lib/logger";
import { checkEvents } from "@/lib/rateLimitEvents";
import { coordsFromEventRow } from "@/lib/eventCoordinates";

/** Grid cell size in degrees (lat/lon) per resolution. */
const RESOLUTION_DEGREES: Record<"coarse" | "medium" | "fine", number> = {
  coarse: 2,
  medium: 0.5,
  fine: 0.25,
};

/** Map confidence_level to numeric for averaging (when confidence_score is null). */
const CONFIDENCE_LEVEL_TO_NUM: Record<string, number> = {
  Low: 33,
  Medium: 66,
  High: 100,
};

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
  primary_location: string | null;
  lat: number | null;
  lon: number | null;
  confidence_score: number | null;
  confidence_level: string | null;
  category: string | null;
};

export type ClusterBucket = {
  lat: number;
  lon: number;
  count: number;
  avg_confidence: number;
  dominant_category: string | null;
  events_sample: string[];
};

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = createRequestLogger({ requestId });

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

  const parseResult = clustersQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parseResult.success) {
    const msg = parseResult.error.errors.map((e) => e.message).join("; ") || "Invalid query params";
    log.warn("Clusters query validation failed", { message: msg });
    return jsonWithCors(
      { error: msg, code: "VALIDATION_FAILED" },
      { status: 400 },
      request
    );
  }

  const { timeline, resolution, category } = parseResult.data;

  const days = timeline === "30d" ? 30 : 7;
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  try {
    let query = supabaseAdmin
      .from("events")
      .select("id, primary_location, lat, lon, confidence_score, confidence_level, category")
      .eq("status", "Published")
      .gte("occurred_at", sinceIso);

    if (category?.trim()) {
      const categories = category.split(",").map((c) => c.trim()).filter(Boolean);
      const valid = categories.filter((c) => (event_category as readonly string[]).includes(c));
      if (valid.length > 0) {
        query = query.in("category", valid);
      }
    }

    const { data: rows, error } = await query;

    if (error) {
      log.error("Clusters events query failed", { error: error.message });
      return jsonWithCors(
        { error: "Failed to fetch events for clustering", code: "INTERNAL_ERROR" },
        { status: 500 },
        request
      );
    }

    const events = (rows ?? []) as EventRow[];
    const gridSize = RESOLUTION_DEGREES[resolution];

    type BucketAcc = {
      count: number;
      confidenceSum: number;
      confidenceCount: number;
      categoryCounts: Record<string, number>;
      ids: string[];
    };
    const buckets = new Map<string, BucketAcc>();

    for (const row of events) {
      const coords = coordsFromEventRow(row);
      if (!coords) continue;

      const latCell = Math.round(coords.lat / gridSize) * gridSize;
      const lonCell = Math.round(coords.lng / gridSize) * gridSize;
      const key = `${latCell},${lonCell}`;

      const rawScore = row.confidence_score != null ? Number(row.confidence_score) : NaN;
      const scoreNum = Number.isFinite(rawScore)
        ? rawScore
        : (row.confidence_level ? CONFIDENCE_LEVEL_TO_NUM[row.confidence_level] : undefined) ?? 50;

      let acc = buckets.get(key);
      if (!acc) {
        acc = { count: 0, confidenceSum: 0, confidenceCount: 0, categoryCounts: {}, ids: [] };
        buckets.set(key, acc);
      }
      acc.count += 1;
      acc.confidenceSum += Number(scoreNum);
      acc.confidenceCount += 1;
      const cat = row.category ?? "Unknown";
      acc.categoryCounts[cat] = (acc.categoryCounts[cat] ?? 0) + 1;
      if (acc.ids.length < 3) acc.ids.push(row.id);
    }

    const result: ClusterBucket[] = [];
    for (const [key, acc] of buckets) {
      const [latStr, lonStr] = key.split(",");
      const lat = Number.parseFloat(latStr);
      const lon = Number.parseFloat(lonStr);
      const avg_confidence =
        acc.confidenceCount > 0
          ? Math.round((acc.confidenceSum / acc.confidenceCount) * 100) / 100
          : 0;
      let dominant_category: string | null = null;
      let maxCount = 0;
      for (const [cat, count] of Object.entries(acc.categoryCounts)) {
        if (count > maxCount) {
          maxCount = count;
          dominant_category = cat;
        }
      }
      result.push({
        lat,
        lon,
        count: acc.count,
        avg_confidence,
        dominant_category,
        events_sample: acc.ids.slice(0, 3),
      });
    }

    result.sort((a, b) => b.count - a.count);

    const res = jsonWithCors(result, { status: 200 }, request);
    res.headers.set("X-RateLimit-Limit", "100");
    res.headers.set("X-RateLimit-Remaining", String(remaining));
    res.headers.set("X-RateLimit-Reset", String(Math.ceil(resetAtMs / 1000)));
    return res;
  } catch (err) {
    log.error("Clusters handler error", { err });
    return jsonWithCors(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
      request
    );
  }
}
