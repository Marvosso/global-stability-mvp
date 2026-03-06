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
  type PublicMapItem,
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
import type { EscalationMapItem, CrisisHeatmapPoint, MapMarkerItem } from "@/components/public/WorldMap";

const WorldMap = dynamic(
  () =>
    import("@/components/public/WorldMap").then((mod) => ({ default: mod.WorldMap })),
  { ssr: false }
);

function MapPageContent() {
  const searchParams = useSearchParams();
  const eventIdFromUrl = searchParams.get("eventId");
  const incidentIdFromUrl = searchParams.get("incidentId");
  const accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  const { user } = useSession();
  const [mapItems, setMapItems] = useState<PublicMapItem[]>([]);
  const [filters, setFilters] = useState<MapFiltersState>(DEFAULT_MAP_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<PublicEvent | null>(null);
  type SelectedIncidentPayload = { incident: { id: string; title: string | null; category: string | null; subtype: string | null; severity: string | null; confidence_level: string | null; primary_location: string | null; country_code: string | null; occurred_at: string | null }; events: PublicEvent[] };
  const [selectedIncident, setSelectedIncident] = useState<SelectedIncidentPayload | null>(null);
  const [escalationClusterEvents, setEscalationClusterEvents] = useState<PublicEvent[]>([]);
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
        setMapItems(Array.isArray(data) ? data : []);
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
    const fromList = mapItems.find((m) => m.id === eventIdFromUrl && m.incident_id == null);
    if (fromList) {
      let cancelled = false;
      fetch(`/api/public/events/${eventIdFromUrl}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: PublicEvent | null) => {
          if (cancelled) return;
          if (data) {
            setSelectedEvent(data);
            setSelectedIncident(null);
            setShowNoLocationList(false);
            setDrawerOpen(true);
          }
        });
      return () => { cancelled = true; };
    }
    let cancelled = false;
    fetch(`/api/public/events/${eventIdFromUrl}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data: PublicEvent) => {
        if (cancelled) return;
        setSelectedEvent(data);
        setSelectedIncident(null);
        setShowNoLocationList(false);
        setDrawerOpen(true);
      })
      .catch(() => {
        if (!cancelled) setError("Event not found");
      });
    return () => {
      cancelled = true;
    };
  }, [eventIdFromUrl, loading, mapItems]);

  useEffect(() => {
    if (!incidentIdFromUrl || loading) return;
    const fromList = mapItems.find((m) => m.id === incidentIdFromUrl && m.incident_id != null);
    if (fromList) {
      let cancelled = false;
      fetch(`/api/public/incidents/${incidentIdFromUrl}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { incident: unknown; events: PublicEvent[] } | null) => {
          if (cancelled) return;
          if (data?.incident && Array.isArray(data.events)) {
            setSelectedIncident({ incident: data.incident as SelectedIncidentPayload["incident"], events: data.events });
            setSelectedEvent(null);
            setShowNoLocationList(false);
            setDrawerOpen(true);
          }
        });
      return () => { cancelled = true; };
    }
    let cancelled = false;
    fetch(`/api/public/incidents/${incidentIdFromUrl}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data: { incident: unknown; events: PublicEvent[] }) => {
        if (cancelled) return;
        setSelectedIncident({ incident: data.incident as SelectedIncidentPayload["incident"], events: data.events ?? [] });
        setSelectedEvent(null);
        setShowNoLocationList(false);
        setDrawerOpen(true);
      })
      .catch(() => {
        if (!cancelled) setError("Incident not found");
      });
    return () => {
      cancelled = true;
    };
  }, [incidentIdFromUrl, loading, mapItems]);

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

  const filteredMapItems = useMemo(() => {
    let list = applyMapFilters(mapItems, filters);
    if (selectedHeatingUpCountry) {
      list = list.filter((e) => (e.country_code ?? "").toUpperCase() === selectedHeatingUpCountry);
    }
    return list;
  }, [mapItems, filters, selectedHeatingUpCountry]);

  const timelineFilteredMapItems = useMemo(
    () => filterEventsByTimeline(filteredMapItems, timelineWindow, timelinePosition),
    [filteredMapItems, timelineWindow, timelinePosition]
  );

  const mapItemsWithCoords = useMemo(
    () => timelineFilteredMapItems.filter((e) => getEventCoordinates(e) !== null),
    [timelineFilteredMapItems]
  );
  const mapItemsWithoutLocation = useMemo(
    () => timelineFilteredMapItems.filter((e) => getEventCoordinates(e) === null),
    [timelineFilteredMapItems]
  );

  const sidebarMapItemList = useMemo(() => {
    if (!Array.isArray(timelineFilteredMapItems) || timelineFilteredMapItems.length === 0) return [];
    return [...timelineFilteredMapItems].sort((a, b) => {
      const ta = Date.parse(a.occurred_at ?? "");
      const tb = Date.parse(b.occurred_at ?? "");
      return Number.isNaN(tb) && Number.isNaN(ta)
        ? 0
        : Number.isNaN(tb)
          ? -1
          : Number.isNaN(ta)
            ? 1
            : tb - ta;
    });
  }, [timelineFilteredMapItems]);

  const handleSheetOpenChange = (open: boolean) => {
    setDrawerOpen(open);
    if (!open) {
      setShowNoLocationList(false);
      setSelectedEvent(null);
      setSelectedIncident(null);
      setSelectedEscalation(null);
    }
  };

  const fetchAndShowMapItem = (item: PublicMapItem) => {
    setShowNoLocationList(false);
    setDrawerOpen(true);
    if (item.incident_id != null) {
      fetch(`/api/public/incidents/${item.id}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { incident: unknown; events: PublicEvent[] } | null) => {
          if (data?.incident && Array.isArray(data.events)) {
            setSelectedIncident({ incident: data.incident as SelectedIncidentPayload["incident"], events: data.events });
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
  };

  const handleMarkerClick = (item: MapMarkerItem) => {
    if ("incident_id" in item || "source_count" in item) {
      fetchAndShowMapItem(item as PublicMapItem);
    } else {
      setSelectedEvent(item as PublicEvent);
      setSelectedIncident(null);
      setShowNoLocationList(false);
      setDrawerOpen(true);
    }
  };

  const handleOpenNoLocation = () => {
    setSelectedEvent(null);
    setShowNoLocationList(true);
    setDrawerOpen(true);
  };

  const handleSelectEventFromList = (event: PublicEvent) => {
    setSelectedEvent(event);
    setSelectedIncident(null);
    setShowNoLocationList(false);
    setSelectedEscalation(null);
  };

  const handleEscalationClick = (escalation: EscalationMapItem) => {
    setSelectedEscalation(escalation);
    setSelectedEvent(null);
    setShowNoLocationList(false);
    setDrawerOpen(true);
  };

  const handleSituationEventClick = (item: import("@/components/public/SituationSidebar").SituationEventLike) => {
    const coords = getEventCoordinates(item);
    if (coords) {
      setCenterOn({ lng: coords[0], lat: coords[1], zoom: 10 });
    }
    if ("summary" in item && item.summary !== undefined) {
      setSelectedEvent(item as PublicEvent);
      setSelectedIncident(null);
    } else {
      fetchAndShowMapItem(item as PublicMapItem);
    }
    setShowNoLocationList(false);
    setSelectedEscalation(null);
    setDrawerOpen(true);
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="absolute left-0 right-0 top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border/80 bg-background/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <h1 className="text-lg font-semibold">Map</h1>
        <div className="flex items-center gap-2">
          {user && <AlertsBell />}
          {mapItemsWithoutLocation.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenNoLocation}
              className="text-xs"
            >
              No location ({mapItemsWithoutLocation.length})
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
                            const item = mapItems.find((m) => m.id === d.id);
                            if (item) {
                              fetchAndShowMapItem(item);
                            } else {
                              fetch(`/api/public/events/${d.id}`)
                                .then((res) => (res.ok ? res.json() : null))
                                .then((data: PublicEvent | null) => {
                                  if (data) {
                                    setSelectedEvent(data);
                                    setSelectedIncident(null);
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
            events={timelineFilteredMapItems}
            onEventClick={handleSituationEventClick}
          />
          <HeatingUpPanel events={filteredMapItems} />
          <div className="flex flex-1 flex-col min-h-0 space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
              Event list
            </h2>
            {sidebarMapItemList.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No events match filters.
              </p>
            ) : (
              <ul className="space-y-1 overflow-y-auto min-h-0 flex-1">
                {sidebarMapItemList.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="w-full rounded-md bg-background px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors"
                      onClick={() => fetchAndShowMapItem(item)}
                    >
                      <div className="truncate font-medium">
                        {item.title?.trim() || "Untitled"}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {item.category}
                        {item.subtype ? ` · ${item.subtype}` : ""} · {item.severity}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {item.occurred_at
                          ? new Date(item.occurred_at).toLocaleDateString(undefined, {
                              dateStyle: "short",
                            })
                          : "—"}
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
              events={mapItemsWithCoords}
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
                  Total: {filteredMapItems.length} | Shown: {timelineFilteredMapItems.length} | Mapped:{" "}
                  {mapItemsWithCoords.length} | No location: {mapItemsWithoutLocation.length}
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
        {!loading && !error && filteredMapItems.length === 0 && (
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
        incident={selectedIncident?.incident ?? null}
        incidentEvents={selectedIncident?.events ?? null}
        onSelectEvent={handleSelectEventFromList}
        eventsWithoutLocation={
          showNoLocationList ? mapItemsWithoutLocation : undefined
        }
        onSelectMapItem={showNoLocationList ? fetchAndShowMapItem : undefined}
        escalationCluster={
          selectedEscalation
            ? {
                region_key: selectedEscalation.region_key,
                event_count: selectedEscalation.event_count,
              }
            : null
        }
        clusterEvents={escalationClusterEvents}
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
