"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { WorldMap, type EscalationMapItem, type MapMarkerItem } from "@/components/public/WorldMap";
import { EventDetailSheet } from "@/components/public/EventDetailSheet";
import { getEventCoordinates, type PublicEvent, type PublicMapItem } from "@/lib/eventCoordinates";
import { getBoundsForRegion } from "@/lib/regionBounds";

const WorldMapDynamic = dynamic(
  () =>
    import("@/components/public/WorldMap").then((mod) => ({ default: mod.WorldMap })),
  { ssr: false }
);

type BriefingItem = {
  event_id: string;
  event_title: string;
  brief_json: unknown;
  generated_at: string;
  version?: number;
};

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function briefingSnippet(brief: unknown): string {
  if (brief == null) return "";
  if (typeof brief === "string") return brief.slice(0, 200);
  if (typeof brief === "object" && "summary" in brief && typeof (brief as { summary: unknown }).summary === "string") {
    return (brief as { summary: string }).summary.slice(0, 200);
  }
  if (typeof brief === "object" && "sections" in brief && Array.isArray((brief as { sections: unknown[] }).sections)) {
    const first = (brief as { sections: { title?: string; content?: string }[] }).sections[0];
    if (first?.content) return first.content.slice(0, 200);
  }
  return JSON.stringify(brief).slice(0, 200);
}

export default function RegionIntelligencePage() {
  const params = useParams();
  const region = typeof params?.region === "string" ? params.region : "";
  const accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

  const [mapItems, setMapItems] = useState<PublicMapItem[]>([]);
  const [escalations, setEscalations] = useState<EscalationMapItem[]>([]);
  const [briefings, setBriefings] = useState<BriefingItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingEscalations, setLoadingEscalations] = useState(true);
  const [loadingBriefings, setLoadingBriefings] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<PublicEvent | null>(null);
  type IncidentPayload = { id: string; title: string | null; category: string | null; subtype: string | null; severity: string | null; confidence_level: string | null; primary_location: string | null; country_code: string | null; occurred_at: string | null };
  const [selectedIncident, setSelectedIncident] = useState<{ incident: IncidentPayload; events: PublicEvent[] } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedEscalation, setSelectedEscalation] = useState<EscalationMapItem | null>(null);
  const [escalationClusterEvents, setEscalationClusterEvents] = useState<PublicEvent[]>([]);

  useEffect(() => {
    if (!region) return;
    setError(null);
    setLoadingEvents(true);
    fetch(`/api/public/events?region=${encodeURIComponent(region)}&limit=100`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load events");
        return res.json();
      })
      .then((data) => setMapItems(Array.isArray(data) ? data : []))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load events"))
      .finally(() => setLoadingEvents(false));
  }, [region]);

  useEffect(() => {
    if (!region) return;
    setLoadingEscalations(true);
    fetch(`/api/public/escalations?region=${encodeURIComponent(region)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load escalations");
        return res.json();
      })
      .then((data) => setEscalations(Array.isArray(data) ? data : []))
      .catch(() => setEscalations([]))
      .finally(() => setLoadingEscalations(false));
  }, [region]);

  useEffect(() => {
    if (!region) return;
    setLoadingBriefings(true);
    fetch(`/api/public/briefings?region=${encodeURIComponent(region)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load briefings");
        return res.json();
      })
      .then((data) => setBriefings(Array.isArray(data) ? data : []))
      .catch(() => setBriefings([]))
      .finally(() => setLoadingBriefings(false));
  }, [region]);

  const initialBounds = useMemo(
    () => getBoundsForRegion(region, mapItems, escalations),
    [region, mapItems, escalations]
  );

  const mapItemsWithCoords = useMemo(
    () => mapItems.filter((e) => getEventCoordinates(e) != null),
    [mapItems]
  );

  const fetchAndShowMapItem = useCallback((item: PublicMapItem) => {
    setDrawerOpen(true);
    if (item.incident_id != null) {
      fetch(`/api/public/incidents/${item.id}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { incident: unknown; events: PublicEvent[] } | null) => {
          if (data?.incident && Array.isArray(data.events)) {
            setSelectedIncident({ incident: data.incident as IncidentPayload, events: data.events });
            setSelectedEvent(null);
          }
        });
    } else {
      fetch(`/api/public/events/${item.id}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: PublicEvent | null) => {
          if (data) {
            setSelectedEvent(data);
            setSelectedIncident(null);
          }
        });
    }
    setSelectedEscalation(null);
  }, []);

  const handleMarkerClick = useCallback((item: MapMarkerItem) => {
    if ("summary" in item && item.summary !== undefined) {
      setSelectedEvent(item as PublicEvent);
      setSelectedIncident(null);
    } else {
      fetchAndShowMapItem(item as PublicMapItem);
    }
    setSelectedEscalation(null);
    setDrawerOpen(true);
  }, [fetchAndShowMapItem]);

  const handleSelectEventFromList = useCallback((event: PublicEvent) => {
    setSelectedEvent(event);
    setSelectedIncident(null);
    setDrawerOpen(true);
  }, []);

  const handleEscalationClick = useCallback((escalation: EscalationMapItem) => {
    setSelectedEscalation(escalation);
    setSelectedEvent(null);
    setSelectedIncident(null);
    setDrawerOpen(true);
  }, []);

  useEffect(() => {
    if (!selectedEscalation?.event_ids?.length) {
      setEscalationClusterEvents([]);
      return;
    }
    let cancelled = false;
    Promise.all(
      selectedEscalation.event_ids.map((id) =>
        fetch(`/api/public/events/${id}`).then((r) => (r.ok ? r.json() : null))
      )
    )
      .then((results) => {
        if (cancelled) return;
        setEscalationClusterEvents(results.filter((e): e is PublicEvent => e != null));
      })
      .catch(() => {
        if (!cancelled) setEscalationClusterEvents([]);
      });
    return () => { cancelled = true; };
  }, [selectedEscalation?.event_ids]);

  const loading = loadingEvents || loadingEscalations || loadingBriefings;

  if (!region) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <p className="text-muted-foreground">Missing region.</p>
        <Link href="/map" className="text-primary underline">
          Back to map
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-background px-4 py-3">
        <div className="flex items-center gap-4">
          <Link
            href="/map"
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            ← Map
          </Link>
          <h1 className="text-lg font-semibold">Region: {region}</h1>
        </div>
      </header>

      {error && (
        <div className="mx-4 mt-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="relative flex-1 min-h-[400px]">
        {accessToken ? (
          <WorldMapDynamic
            accessToken={accessToken}
            events={mapItemsWithCoords}
            escalations={escalations}
            onMarkerClick={handleMarkerClick}
            onEscalationClick={handleEscalationClick}
            initialBounds={initialBounds}
          />
        ) : (
          <div className="flex h-[400px] items-center justify-center bg-muted text-sm text-muted-foreground">
            Map unavailable. Set NEXT_PUBLIC_MAPBOX_TOKEN.
          </div>
        )}
        {loading && (
          <div className="absolute left-4 right-4 top-4 z-20 rounded-md border border-border bg-background/95 px-4 py-2 text-sm shadow backdrop-blur">
            Loading regional data…
          </div>
        )}
      </div>

      <div className="border-t bg-background px-4 py-4">
        <div className="mx-auto grid gap-6 sm:grid-cols-1 lg:grid-cols-3">
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Recent events
            </h2>
            {loadingEvents ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : mapItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events in this region.</p>
            ) : (
              <ul className="space-y-2">
                {mapItems.slice(0, 10).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                      onClick={() => fetchAndShowMapItem(item)}
                    >
                      <span className="font-medium">{item.title?.trim() || "Untitled"}</span>
                      <span className="ml-1 text-muted-foreground">
                        · {item.category} · {item.severity}
                      </span>
                      <br />
                      <span className="text-xs text-muted-foreground">
                        {item.primary_location ?? "No location"} · {item.occurred_at ? formatDate(item.occurred_at) : "—"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Escalation alerts
            </h2>
            {loadingEscalations ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : escalations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open escalations.</p>
            ) : (
              <ul className="space-y-2">
                {escalations.map((esc) => (
                  <li key={esc.id}>
                    <button
                      type="button"
                      className="w-full rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left text-sm transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
                      onClick={() => handleEscalationClick(esc)}
                    >
                      <span className="font-medium">{esc.region_key}</span>
                      <span className="ml-1 text-muted-foreground">
                        · {esc.event_count} events · {esc.severity}
                      </span>
                      <br />
                      <span className="text-xs text-muted-foreground">
                        {formatDate(esc.created_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Approved AI briefings
            </h2>
            {loadingBriefings ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : briefings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No approved briefings.</p>
            ) : (
              <ul className="space-y-2">
                {briefings.map((b, i) => (
                  <li key={`${b.event_id}-${b.generated_at}-${i}`}>
                    <div className="rounded-md border border-border bg-card px-3 py-2 text-sm">
                      <p className="font-medium">{b.event_title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(b.generated_at)}
                        {b.version != null ? ` · v${b.version}` : ""}
                      </p>
                      <p className="mt-1 line-clamp-2 text-muted-foreground">
                        {briefingSnippet(b.brief_json)}
                        {briefingSnippet(b.brief_json).length >= 200 ? "…" : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <EventDetailSheet
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) {
            setSelectedEvent(null);
            setSelectedIncident(null);
          }
        }}
        event={selectedEvent}
        incident={selectedIncident?.incident ?? null}
        incidentEvents={selectedIncident?.events ?? null}
        escalationCluster={
          selectedEscalation
            ? {
                region_key: selectedEscalation.region_key,
                event_count: selectedEscalation.event_count,
              }
            : null
        }
        clusterEvents={escalationClusterEvents}
        onSelectEvent={handleSelectEventFromList}
      />
    </div>
  );
}
