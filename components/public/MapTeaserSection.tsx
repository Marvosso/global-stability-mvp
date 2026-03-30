"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import type { SimpleEvent } from "@/components/public/SimpleEventsMap";
import { coordsForPublicMapEvent } from "@/lib/mapEventNormalize";

const MapTeaserMap = dynamic(
  () =>
    import("@/components/public/MapTeaserMap").then((mod) => ({
      default: mod.MapTeaserMap,
    })),
  { ssr: false }
);

const MAX_MARKERS = 20;

function normalizeEvents(data: unknown[]): SimpleEvent[] {
  const out: SimpleEvent[] = [];
  for (const raw of data) {
    if (out.length >= MAX_MARKERS) break;
    const o = raw as Record<string, unknown>;
    const coords = coordsForPublicMapEvent({
      lat: o.lat,
      lon: o.lon,
      primary_location: o.primary_location,
    });
    if (!coords) continue;
    out.push({
      id: String(o.id),
      title: String(o.title ?? ""),
      category: (o.category as string) ?? null,
      occurred_at: (o.occurred_at as string) ?? null,
      confidence: (o.confidence as string) ?? null,
      summary: (o.summary as string) ?? null,
      sources: Array.isArray(o.sources) ? (o.sources as string[]) : [],
      lat: coords.lat,
      lon: coords.lon,
    });
  }
  return out;
}

export function MapTeaserSection() {
  const showTeaser =
    process.env.NEXT_PUBLIC_SHOW_MAP_TEASER === "true" ||
    process.env.NEXT_PUBLIC_SHOW_MAP_TEASER === "1";

  const [events, setEvents] = useState<SimpleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/events?limit=50");
      if (!res.ok) throw new Error("Failed to load events");
      const json = await res.json();
      const data = Array.isArray(json?.data) ? json.data : [];
      setEvents(normalizeEvents(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showTeaser) fetchEvents();
  }, [showTeaser, fetchEvents]);

  if (!showTeaser) return null;

  const hasGeo = events.length > 0;

  return (
    <section className="mb-16">
      <h3 className="mb-2 text-xl font-semibold">
        See It Live – Recent Crisis Events on Map
      </h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Recent published events with coordinates (sample). Click markers for details.
      </p>

      <div className="rounded-lg border border-border overflow-hidden bg-muted/30">
        <div className="relative w-full" style={{ height: "400px" }}>
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/50">
              <div className="rounded-lg border border-border bg-background px-4 py-2 text-sm shadow">
                Loading events…
              </div>
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/50">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
          {!loading && !error && (
            <>
              <div className="h-full w-full">
                <MapTeaserMap events={events} />
              </div>
              {!hasGeo && (
                <div className="absolute left-3 right-3 bottom-3 z-[1000] rounded-md border border-border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow backdrop-blur">
                  No markers yet: published events need latitude/longitude or a parseable
                  location. Use admin geo backfill or ingest feeds that supply coordinates.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link href="/map">View Full Map</Link>
        </Button>
      </div>
    </section>
  );
}
