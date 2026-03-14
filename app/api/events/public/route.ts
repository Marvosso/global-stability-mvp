/**
 * Public map events API alias.
 * GET /api/events/public — no auth, returns published events (default limit 500, last 7 days).
 * Forwards to /api/public/events with default query params for the map view.
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const params = new URLSearchParams(url.searchParams);
  if (!params.has("limit")) params.set("limit", "500");
  if (!params.has("days")) params.set("days", "7");
  const base = request.nextUrl?.origin ?? url.origin;
  const target = `${base}/api/public/events?${params.toString()}`;
  try {
    const res = await fetch(target, {
      headers: request.headers,
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch public events" },
      { status: 502 }
    );
  }
}
