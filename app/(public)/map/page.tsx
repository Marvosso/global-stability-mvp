"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { EventDetailSheet } from "@/components/public/EventDetailSheet";
import { HeatingUpPanel } from "@/components/public/HeatingUpPanel";
import { MapFilters } from "@/components/public/MapFilters";
import { MapLegend } from "@/components/public/MapLegend";
import { MapTimeline } from "@/components/public/MapTimeline";
import { SituationSidebar } from "@/components/public/SituationSidebar";
import { AlertsBell } from "@/components/alerts/AlertsBell";
import {
  getEventCoordinates,
  type PublicEvent,
} from "@/lib/eventCoordinates";
import { useSession } from "@/components/auth/SessionProvider";
import {
  type MapFiltersState,
  DEFAULT_MAP_FILTERS,
  applyMapFilters,
} from "@/lib/mapFilters";
import {
  filterEventsByTimeline,
  type TimelineWindow,
} from "@/lib/timeline";
import type {
  HeatingUpCountry,
  HeatingUpEventDriver,
} from "@/app/api/public/summary/heating-up/route";
import type { EscalationMapItem, CrisisHeatmapPoint } from "@/components/public/WorldMap";

const WorldMap = dynamic(
  () =>
    import("@/components/public/WorldMap").then((mod) => ({ default: mod.WorldMap })),
  { ssr: false }
);

function MapPageContent() {
  const searchParams = useSearchParams();
  const eventIdFromUrl = searchParams.get("eventId");
  const accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  const { user } = useSession();
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [filters, setFilters] = useState<MapFiltersState>(DEFAULT_MAP_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<PublicEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showNoLocationList, setShowNoLocationList] = useState(false);
  const [heatingUpCountries, setHeatingUpCountries] = useState<HeatingUpCountry[]>([]);
  const [eventDrivers, setEventDrivers] = useState<HeatingUpEventDriver[]>([]);
  const [heatmap, setHeatmap] = useState<Array<{ country_code: string; stability_score: number; delta_24h: number | null }>>([]);
  const [crisisHeatmap, setCrisisHeatmap] = useState<CrisisHeatmapPoint[]>([]);
  const [loadingHeatingUp, setLoadingHeatingUp] = useState(true);
  const [selectedHeatingUpCountry, setSelectedHeatingUpCountry] = useState<string | null>(null);
  const [escalations, setEscalations] = useState<EscalationMapItem[]>([]);
  const [selectedEscalation, setSelectedEscalation] = useState<EscalationMapItem | null>(null);
  const [timelineWindow, setTimelineWindow] = useState<TimelineWindow>("72h");
  const [timelinePosition, setTimelinePosition] = useState(1);
  const [centerOn, setCenterOn] = useState<{ lng: number; lat: number; zoom?: number } | null>(null);
  const [showEscalationRiskLayer, setShowEscalationRiskLayer] = useState(false);
  const [escalationRiskData, setEscalationRiskData] = useState<Array<{ region_code: string; risk_score: number; risk_level: string }> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/public/events?limit=200&offset=0")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load events");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setEvents(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load events");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingHeatingUp(true);
    fetch("/api/public/summary/heating-up?limit=10")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load heating-up summary");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setHeatingUpCountries(Array.isArray(data?.countries) ? data.countries : []);
        setEventDrivers(Array.isArray(data?.eventDrivers) ? data.eventDrivers : []);
      })
      .catch(() => {
        if (!cancelled) {
          setHeatingUpCountries([]);
          setEventDrivers([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingHeatingUp(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/heatmap")
      .then((res) => {
        if (!res.ok) return [];
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setHeatmap(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setHeatmap([]);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/crisis-heatmap")
      .then((res) => {
        if (!res.ok) return [];
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setCrisisHeatmap(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setCrisisHeatmap([]);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/escalations")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load escalations");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setEscalations(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setEscalations([]);
      });
    return () => { cancelled = true; };
  }, []);

  const handleEscalationRiskLayerChange = (show: boolean) => {
    if (show) {
      setShowEscalationRiskLayer(true);
      fetch("/api/public/escalation-risk")
        .then((res) => {
          if (!res.ok) return [];
          return res.json();
        })
        .then((data) => {
          setEscalationRiskData(Array.isArray(data) ? data : []);
        })
        .catch(() => {
          setEscalationRiskData([]);
        });
    } else {
      setShowEscalationRiskLayer(false);
      setEscalationRiskData(null);
    }
  };

  useEffect(() => {
    if (!eventIdFromUrl || loading) return;
    const fromList = events.find((e) => e.id === eventIdFromUrl);
    if (fromList) {
      setSelectedEvent(fromList);
      setShowNoLocationList(false);
      setDrawerOpen(true);
      return;
    }
    let cancelled = false;
    fetch(`/api/public/events/${eventIdFromUrl}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data: PublicEvent) => {
        if (cancelled) return;
        setEvents((prev) =>
          prev.some((e) => e.id === data.id) ? prev : [...prev, data]
        );
        setSelectedEvent(data);
        setShowNoLocationList(false);
        setDrawerOpen(true);
      })
      .catch(() => {
        if (!cancelled) setError("Event not found");
      });
    return () => {
      cancelled = true;
    };
  }, [eventIdFromUrl, loading, events]);

  const filteredEvents = useMemo(() => {
    let list = applyMapFilters(events, filters);
    if (selectedHeatingUpCountry) {
      list = list.filter((e) => (e.country_code ?? "").toUpperCase() === selectedHeatingUpCountry);
    }
    return list;
  }, [events, filters, selectedHeatingUpCountry]);

  const timelineFilteredEvents = useMemo(
    () => filterEventsByTimeline(filteredEvents, timelineWindow, timelinePosition),
    [filteredEvents, timelineWindow, timelinePosition]
  );

  const eventsWithCoords = useMemo(
    () => timelineFilteredEvents.filter((e) => getEventCoordinates(e) !== null),
    [timelineFilteredEvents]
  );
  const eventsWithoutLocation = useMemo(
    () => timelineFilteredEvents.filter((e) => getEventCoordinates(e) === null),
    [timelineFilteredEvents]
  );

  const sidebarEventList = useMemo(() => {
    if (!Array.isArray(timelineFilteredEvents) || timelineFilteredEvents.length === 0) return [];
    return [...timelineFilteredEvents].sort((a, b) => {
      const ta = Date.parse(a.occurred_at ?? a.created_at);
      const tb = Date.parse(b.occurred_at ?? b.created_at);
      return Number.isNaN(tb) && Number.isNaN(ta)
        ? 0
        : Number.isNaN(tb)
          ? -1
          : Number.isNaN(ta)
            ? 1
            : tb - ta;
    });
  }, [timelineFilteredEvents]);

  const handleSheetOpenChange = (open: boolean) => {
    setDrawerOpen(open);
    if (!open) {
      setShowNoLocationList(false);
      setSelectedEvent(null);
      setSelectedEscalation(null);
    }
  };

  const handleMarkerClick = (event: PublicEvent) => {
    setSelectedEvent(event);
    setShowNoLocationList(false);
    setDrawerOpen(true);
  };

  const handleOpenNoLocation = () => {
    setSelectedEvent(null);
    setShowNoLocationList(true);
    setDrawerOpen(true);
  };

  const handleSelectEventFromList = (event: PublicEvent) => {
    setSelectedEvent(event);
    setShowNoLocationList(false);
    setSelectedEscalation(null);
  };

  const handleEscalationClick = (escalation: EscalationMapItem) => {
    setSelectedEscalation(escalation);
    setSelectedEvent(null);
    setShowNoLocationList(false);
    setDrawerOpen(true);
  };

  const handleSituationEventClick = (event: PublicEvent) => {
    const coords = getEventCoordinates(event);
    if (coords) {
      setCenterOn({ lng: coords[0], lat: coords[1], zoom: 10 });
    }
    setSelectedEvent(event);
    setShowNoLocationList(false);
    setSelectedEscalation(null);
    setDrawerOpen(true);
  };

  const clusterEvents = useMemo(() => {
    if (!selectedEscalation?.event_ids?.length) return [];
    const set = new Set(selectedEscalation.event_ids);
    return events.filter((e) => set.has(e.id));
  }, [selectedEscalation, events]);

  return (
    <div className="flex h-screen flex-col">
      <header className="absolute left-0 right-0 top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border/80 bg-background/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <h1 className="text-lg font-semibold">Map</h1>
        <div className="flex items-center gap-2">
          {user && <AlertsBell />}
          {eventsWithoutLocation.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenNoLocation}
              className="text-xs"
            >
              No location ({eventsWithoutLocation.length})
            </Button>
          )}
          <Link
            href="/"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Events
          </Link>
        </div>
      </header>

      <div className="relative flex flex-1 min-h-0 pt-14">
        <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-border bg-muted/30 p-3 space-y-4 md:block">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Filters
            </h2>
            <MapFilters value={filters} onChange={setFilters} />
          </div>
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Heating up
            </h2>
            {loadingHeatingUp ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : heatingUpCountries.length === 0 && eventDrivers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No score drops or event drivers.</p>
            ) : (
              <>
                {heatingUpCountries.length > 0 && (
                  <ul className="space-y-0.5">
                    <p className="text-[11px] text-muted-foreground mb-0.5">Biggest score drop (24h)</p>
                    {heatingUpCountries.map((c) => (
                      <li key={c.country_code}>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedHeatingUpCountry((prev) =>
                              prev === c.country_code ? null : c.country_code
                            )
                          }
                          className={`w-full rounded-md px-2 py-1 text-left text-xs transition-colors ${
                            selectedHeatingUpCountry === c.country_code
                              ? "bg-primary text-primary-foreground"
                              : "bg-background hover:bg-muted"
                          }`}
                        >
                          <span className="truncate block font-medium">{c.country_code}</span>
                          <span className="text-[11px] opacity-90">
                            Score {c.stability_score}
                            {c.delta_24h != null ? ` · ${c.delta_24h >= 0 ? `+${c.delta_24h}` : c.delta_24h} (24h)` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {eventDrivers.length > 0 && (
                  <ul className="space-y-0.5 mt-2">
                    <p className="text-[11px] text-muted-foreground mb-0.5">Top event drivers</p>
                    {eventDrivers.map((d) => (
                      <li key={d.id}>
                        <button
                          type="button"
                          className="w-full rounded-md bg-background px-2 py-1 text-left text-xs hover:bg-muted transition-colors"
                          onClick={() => {
                            const ev = events.find((e) => e.id === d.id);
                            if (ev) {
                              setSelectedEvent(ev);
                              setShowNoLocationList(false);
                              setDrawerOpen(true);
                            } else {
                              fetch(`/api/public/events/${d.id}`)
                                .then((res) => res.ok ? res.json() : null)
                                .then((data: PublicEvent | null) => {
                                  if (data) {
                                    setEvents((prev) =>
                                      prev.some((e) => e.id === data.id) ? prev : [...prev, data]
                                    );
                                    setSelectedEvent(data);
                                    setShowNoLocationList(false);
                                    setDrawerOpen(true);
                                  }
                                });
                            }
                          }}
                        >
                          <span className="truncate block font-medium">
                            {d.title?.trim() || "Untitled"}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {d.country_code ?? "—"} · {d.severity}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {selectedHeatingUpCountry && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs w-full"
                onClick={() => setSelectedHeatingUpCountry(null)}
              >
                Clear region filter
              </Button>
            )}
          </div>
          <SituationSidebar
            events={timelineFilteredEvents}
            onEventClick={handleSituationEventClick}
          />
          <HeatingUpPanel events={filteredEvents} />
          <div className="flex flex-1 flex-col min-h-0 space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
              Event list
            </h2>
            {sidebarEventList.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No events match filters.
              </p>
            ) : (
              <ul className="space-y-1 overflow-y-auto min-h-0 flex-1">
                {sidebarEventList.map((ev) => (
                  <li key={ev.id}>
                    <button
                      type="button"
                      className="w-full rounded-md bg-background px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors"
                      onClick={() => {
                        setSelectedEvent(ev);
                        setShowNoLocationList(false);
                        setDrawerOpen(true);
                      }}
                    >
                      <div className="truncate font-medium">
                        {ev.title?.trim() || "Untitled"}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {ev.category}
                        {ev.subtype ? ` · ${ev.subtype}` : ""} · {ev.severity}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {ev.occurred_at
                          ? new Date(ev.occurred_at).toLocaleDateString(undefined, {
                              dateStyle: "short",
                            })
                          : new Date(ev.created_at).toLocaleDateString(undefined, {
                              dateStyle: "short",
                            })}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
        <div className="relative flex-1 min-h-0">
        {accessToken ? (
          <>
            <WorldMap
              accessToken={accessToken}
              events={eventsWithCoords}
              escalations={escalations}
              heatmap={heatmap.length > 0 ? heatmap : undefined}
              crisisHeatmap={crisisHeatmap.length > 0 ? crisisHeatmap : undefined}
              escalationRisk={escalationRiskData ?? undefined}
              showEscalationRiskLayer={showEscalationRiskLayer}
              onMarkerClick={handleMarkerClick}
              onEscalationClick={handleEscalationClick}
              centerOn={centerOn}
              onCentered={() => setCenterOn(null)}
            />
            <div className="absolute bottom-4 left-4 z-20 flex flex-col gap-2">
              <MapTimeline
                window={timelineWindow}
                position={timelinePosition}
                onWindowChange={setTimelineWindow}
                onPositionChange={setTimelinePosition}
              />
              <MapLegend
                showEscalationRiskLayer={showEscalationRiskLayer}
                onEscalationRiskLayerChange={handleEscalationRiskLayerChange}
              />
              {!loading && !error && (
                <div className="rounded-md border border-border bg-background/95 px-3 py-1.5 text-xs text-muted-foreground shadow backdrop-blur">
                  Total: {filteredEvents.length} | Shown: {timelineFilteredEvents.length} | Mapped:{" "}
                  {eventsWithCoords.length} | No location: {eventsWithoutLocation.length}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">
            Map unavailable. Set NEXT_PUBLIC_MAPBOX_TOKEN.
          </div>
        )}

        {loading && (
          <div className="absolute left-4 right-4 top-4 z-20 rounded-md border border-border bg-background/95 px-4 py-2 text-sm shadow backdrop-blur">
            Loading events…
          </div>
        )}
        {error && (
          <div className="absolute left-4 right-4 top-4 z-20 rounded-md border border-destructive/50 bg-background px-4 py-2 text-sm text-destructive shadow">
            {error}
          </div>
        )}
        {!loading && !error && filteredEvents.length === 0 && (
          <div className="absolute left-4 right-4 top-4 z-20 rounded-md border border-border bg-background/95 px-4 py-2 text-sm shadow backdrop-blur">
            No published events.
          </div>
        )}
        </div>
      </div>

      <EventDetailSheet
        open={drawerOpen}
        onOpenChange={handleSheetOpenChange}
        event={showNoLocationList ? null : selectedEvent}
        eventsWithoutLocation={
          showNoLocationList ? eventsWithoutLocation : undefined
        }
        onSelectEvent={handleSelectEventFromList}
        escalationCluster={
          selectedEscalation
            ? {
                region_key: selectedEscalation.region_key,
                event_count: selectedEscalation.event_count,
              }
            : null
        }
        clusterEvents={clusterEvents}
      />
    </div>
  );
}

function MapPageFallback() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-2 bg-muted/30">
      <p className="text-sm text-muted-foreground">Loading map…</p>
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={<MapPageFallback />}>
      <MapPageContent />
    </Suspense>
  );
}
