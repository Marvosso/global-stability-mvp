/**
 * GET /api/internal/review/queue
 * Returns UnderReview events with optional filters (category, severity, search)
 * and pagination (limit/offset). Auth: Admin and Reviewer only.
 */

import { supabaseAdmin } from "../../../_lib/db";
import { requireReviewer } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import { responseFromThrown, internalError } from "@/lib/apiError";
import { NextRequest, NextResponse } from "next/server";
import { event_category, severity_level } from "@/app/api/_lib/enums";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const SELECT_FIELDS =
  "id, title, category, subtype, severity, confidence_level, occurred_at, primary_location, created_at";

function parseLimit(value: string | null): number {
  if (value == null || value === "") return DEFAULT_LIMIT;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function parseOffset(value: string | null): number {
  if (value == null || value === "") return 0;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** Escape for use inside PostgREST ilike pattern: \ % _ . Use * for wildcard to avoid URL encoding. */
function escapeIlike(term: string): string {
  const escaped = term
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, " "); // comma would break or() syntax
  return `*${escaped}*`;
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  let ctx: { userId: string; role: "Admin" | "Reviewer" } | undefined;
  try {
    ctx = await requireReviewer(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    throw err;
  }

  const log = createRequestLogger({ requestId, role: ctx.role });
  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));
  const offset = parseOffset(searchParams.get("offset"));
  const category = searchParams.get("category")?.trim() || null;
  const severityParam = searchParams.get("severity")?.trim() || null;
  const search = searchParams.get("search")?.trim() || null;

  if (category != null && !event_category.includes(category as (typeof event_category)[number])) {
    log.warn("Review queue invalid category", { category });
    return NextResponse.json(
      { error: "Invalid category" },
      { status: 400 }
    );
  }
  if (severityParam != null && !severity_level.includes(severityParam as (typeof severity_level)[number])) {
    log.warn("Review queue invalid severity", { severity: severityParam });
    return NextResponse.json(
      { error: "Invalid severity" },
      { status: 400 }
    );
  }

  let query = supabaseAdmin
    .from("events")
    .select(SELECT_FIELDS, { count: "exact" })
    .eq("status", "UnderReview")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (category != null) query = query.eq("category", category);
  if (severityParam != null) query = query.eq("severity", severityParam);
  if (search != null && search.length > 0) {
    const pattern = escapeIlike(search);
    query = query.or(`title.ilike.${pattern},summary.ilike.${pattern}`);
  }

  const { data, error, count } = await query;

  if (error) {
    log.error("Review queue query failed", { error: error.message });
    return internalError(error.message);
  }

  const items = data ?? [];
  const total = count ?? 0;
  log.info("Review queue listed", { count: items.length, total, limit, offset });
  return NextResponse.json({ items, total, limit, offset });
}
