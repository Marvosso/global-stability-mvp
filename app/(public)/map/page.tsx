"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { getCategoryColor } from "@/lib/mapMarkerStyle";
import type { SimpleEvent } from "@/components/public/SimpleEventsMap";

import "leaflet/dist/leaflet.css";

const SimpleEventsMap = dynamic(
  () =>
    import("@/components/public/SimpleEventsMap").then((mod) => ({
      default: mod.SimpleEventsMap,
    })),
  { ssr: false }
);

type TimelineFilter = "24h" | "7d" | "30d";

function sinceParam(window: TimelineFilter): string {
  const d = new Date();
  if (window === "24h") d.setDate(d.getDate() - 1);
  else if (window === "7d") d.setDate(d.getDate() - 7);
  else d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

const LEGEND_ITEMS: { label: string; category: string }[] = [
  { label: "Armed Conflict", category: "Armed Conflict" },
  { label: "Political Tension", category: "Political Tension" },
  { label: "Natural Disaster", category: "Natural Disaster" },
  { label: "Humanitarian", category: "Humanitarian Crisis" },
  { label: "Other", category: "Other" },
];

export default function MapPage() {
  const [events, setEvents] = useState<SimpleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineFilter>("7d");

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since = sinceParam(timeline);
    try {
      const res = await fetch(
        `/api/events?limit=100&since=${encodeURIComponent(since)}`
      );
      if (!res.ok) throw new Error("Failed to load events");
      const json = await res.json();
      const data = Array.isArray(json?.data) ? json.data : [];
      setEvents(
        data
          .filter(
            (e: { lat?: number | null; lon?: number | null }) =>
              e.lat != null &&
              e.lon != null &&
              Number.isFinite(e.lat) &&
              Number.isFinite(e.lon) &&
              !(e.lat === 0 && e.lon === 0)
          )
          .map((e: Record<string, unknown>) => ({
            id: e.id,
            title: e.title,
            category: e.category ?? null,
            occurred_at: e.occurred_at ?? null,
            confidence: e.confidence ?? null,
            summary: e.summary ?? null,
            sources: Array.isArray(e.sources) ? e.sources : [],
            lat: Number(e.lat),
            lon: Number(e.lon),
          }))
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load events"
      );
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [timeline]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const hasGeo = events.length > 0;

  return (
    <div className="relative h-screen w-full flex flex-col">
      <header className="flex-none flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-background/95 z-10">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            ← GeoStability API
          </Link>
          <span className="text-muted-foreground">|</span>
          <span className="text-sm font-medium">Public map</span>
        </div>
        <div className="flex items-center gap-2">
          {(["24h", "7d", "30d"] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setTimeline(w)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                timeline === w
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {w === "24h" ? "24h" : w === "7d" ? "7 days" : "30 days"}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-muted/50">
            <div className="rounded-lg border border-border bg-background px-4 py-3 shadow flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm">Loading events…</span>
            </div>
          </div>
        )}
        {error && !loading && (
          <div className="absolute left-4 right-4 top-4 z-20 rounded-md border border-destructive/50 bg-background px-4 py-2 text-sm text-destructive shadow">
            {error}
          </div>
        )}
        {!loading && !error && !hasGeo && (
          <div className="absolute left-4 right-4 top-4 z-20 rounded-md border border-border bg-background/95 px-4 py-3 text-sm shadow">
            No location data available yet – check API for raw coordinates.
          </div>
        )}
        {!loading && (
          <div className="absolute inset-0 z-0">
            {hasGeo ? (
              <SimpleEventsMap events={events} />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-muted/30 text-muted-foreground text-sm">
                No events with coordinates for this period.
              </div>
            )}
          </div>
        )}

        {!loading && hasGeo && (
          <div className="absolute bottom-4 left-4 z-[1000] rounded-md border border-border bg-background/95 px-3 py-2 text-xs shadow backdrop-blur">
            <div className="font-medium mb-1.5">Categories</div>
            <ul className="space-y-1">
              {LEGEND_ITEMS.map(({ label, category }) => (
                <li key={category} className="flex items-center gap-2">
                  <span
                    className="inline-block w-3 h-3 rounded-full border border-white shadow"
                    style={{
                      backgroundColor: getCategoryColor(category),
                    }}
                  />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
