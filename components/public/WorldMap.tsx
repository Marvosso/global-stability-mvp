"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  getEventCoordinates,
  type PublicEvent,
  type PublicMapItem,
} from "@/lib/eventCoordinates";
import {
  getSeverityLevel,
  getRadiusForLevel,
  getConfidenceOpacity,
} from "@/lib/mapMarkerStyle";

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const EVENTS_SOURCE_ID = "events-source";
const EVENTS_LAYER_ID = "events-circles";
const EVENTS_CLUSTERS_LAYER_ID = "events-clusters";
const EVENTS_CLUSTER_COUNT_LAYER_ID = "events-cluster-count";
const ESCALATIONS_SOURCE_ID = "escalations-source";
const ESCALATIONS_LAYER_ID = "escalations-circles";
const CRISIS_HEATMAP_SOURCE_ID = "crisis-heatmap-source";
const CRISIS_HEATMAP_LAYER_ID = "crisis-heatmap-layer";
const ESCALATION_RINGS_SOURCE_ID = "escalation-rings-source";
const ESCALATION_RINGS_LAYER_ID = "escalation-rings-layer";
const ESCALATION_RISK_SOURCE_ID = "escalation-risk-source";
const ESCALATION_RISK_LAYER_ID = "escalation-risk-layer";

/** Natural Earth 110m countries; has ISO_A2. Fallback when /data/countries.geojson not present. */
const COUNTRIES_GEOJSON_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";

/** Animation: expand duration (s), fade duration (s), max ring radius (px). */
const RING_EXPAND_DURATION = 1.2;
const RING_FADE_DURATION = 0.5;
const RING_MAX_RADIUS = 40;

export type CrisisHeatmapPoint = {
  lat: number;
  lng: number;
  intensity: number;
  category: string;
};

type FeatureProperties = {
  eventId: string;
  radius: number;
  confidenceOpacity: number;
  category: string | null;
  title: string | null;
  severity: string | null;
  confidenceLevel: string | null;
  occurredAt: string | null;
  sourceCount: number;
};

export type EscalationMapItem = {
  id: string;
  region_key: string;
  category: string;
  severity: string;
  event_count: number;
  window_hours: number;
  created_at: string;
  event_ids: string[];
  centroid_lng: number | null;
  centroid_lat: number | null;
};

/** Event or map item (incident/standalone) for map markers. */
export type MapMarkerItem = PublicEvent | PublicMapItem;

type WorldMapProps = {
  accessToken: string;
  /** Map items (incidents + standalone events) or full events for markers. */
  events: MapMarkerItem[];
  escalations?: EscalationMapItem[];
  /** Optional stability scores per country for future choropleth layer */
  heatmap?: Array<{ country_code: string; stability_score: number; delta_24h: number | null }>;
  /** Point-based crisis heatmap: lat, lng, intensity, category. Rendered below event markers. */
  crisisHeatmap?: CrisisHeatmapPoint[];
  /** Escalation risk per region for country choropleth. When provided with showEscalationRiskLayer, shades countries by risk_level. */
  escalationRisk?: Array<{ region_code: string; risk_score: number; risk_level: string }> | null;
  /** When true, show the escalation risk fill layer (country shading by risk_level). */
  showEscalationRiskLayer?: boolean;
  onMarkerClick: (item: MapMarkerItem) => void;
  onEscalationClick?: (escalation: EscalationMapItem) => void;
  /** Optional bounds [[swLng, swLat], [neLng, neLat]] to fit map on load */
  initialBounds?: [[number, number], [number, number]];
  /** When set, fly map to this center (e.g. from Situation sidebar); cleared via onCentered */
  centerOn?: { lng: number; lat: number; zoom?: number } | null;
  /** Called after flyTo(centerOn) completes; use to clear centerOn state */
  onCentered?: () => void;
  /** When user clicks on map background or heat/colored area (not on a marker), called with click lng/lat for region event list */
  onRegionClick?: (lngLat: { lng: number; lat: number }) => void;
};

function buildEventsGeoJSON(
  events: MapMarkerItem[]
): {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: FeatureProperties;
  }>;
} {
  const features = events
    .map((event) => {
      const coords = getEventCoordinates(event);
      if (!coords) return null;
      const level = getSeverityLevel(event.severity ?? "");
      const title = "title" in event ? (event.title ?? null) : null;
      const sourceCount = "source_count" in event ? Number((event as { source_count?: number }).source_count ?? 0) : 0;
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: coords },
        properties: {
          eventId: event.id,
          radius: getRadiusForLevel(level),
          confidenceOpacity: getConfidenceOpacity(event.confidence_level ?? undefined),
          category: ("category" in event ? event.category : null) ?? null,
          title,
          severity: event.severity ?? null,
          confidenceLevel: event.confidence_level ?? null,
          occurredAt: ("occurred_at" in event ? event.occurred_at : null) ?? null,
          sourceCount,
        },
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);
  return { type: "FeatureCollection", features };
}

function buildCrisisHeatmapGeoJSON(
  points: CrisisHeatmapPoint[]
): {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: { intensity: number };
  }>;
} {
  const features = points.map((p) => ({
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      coordinates: [p.lng, p.lat] as [number, number],
    },
    properties: { intensity: p.intensity },
  }));
  return { type: "FeatureCollection", features };
}

function buildEscalationsGeoJSON(
  escalations: EscalationMapItem[]
): {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: { escalationId: string };
  }>;
} {
  const features = escalations
    .filter(
      (e) =>
        e.centroid_lng != null &&
        e.centroid_lat != null &&
        Number.isFinite(e.centroid_lng) &&
        Number.isFinite(e.centroid_lat)
    )
    .map((e) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [e.centroid_lng!, e.centroid_lat!] as [number, number],
      },
      properties: { escalationId: e.id },
    }));
  return { type: "FeatureCollection", features };
}

type GeoJSONFeature = {
  type: "Feature";
  geometry: unknown;
  properties: Record<string, unknown>;
};

/** Merge escalation risk into countries GeoJSON by matching region_code to ISO_A2. */
function mergeCountriesWithRisk(
  countriesGeoJSON: { type: "FeatureCollection"; features: GeoJSONFeature[] },
  escalationRisk: Array<{ region_code: string; risk_score: number; risk_level: string }>
): { type: "FeatureCollection"; features: GeoJSONFeature[] } {
  const riskByRegion = new Map(
    escalationRisk.map((r) => [r.region_code.trim().toUpperCase(), r])
  );
  const features = countriesGeoJSON.features.map((f) => {
    const props = f.properties ?? {};
    const iso2 = (props.ISO_A2 ?? props.iso_a2 ?? "").toString().trim().toUpperCase();
    const validCode = iso2 && iso2 !== "-99" && iso2 !== "-";
    const risk = validCode ? riskByRegion.get(iso2) : undefined;
    return {
      ...f,
      properties: {
        ...props,
        risk_level: risk?.risk_level ?? "none",
        risk_score: risk?.risk_score ?? null,
      },
    };
  });
  return { type: "FeatureCollection", features };
}

type RingFeatureProperties = { eventId: string; radius: number; opacity: number };

function buildEscalationRingsGeoJSON(
  events: MapMarkerItem[],
  startTimes: Map<string, number>,
  now: number
): {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: RingFeatureProperties;
  }>;
} {
  const ringEvents = events.filter(
    (e) =>
      (e.severity === "High" || e.severity === "Critical") &&
      getEventCoordinates(e) != null
  );
  const totalDuration = RING_EXPAND_DURATION + RING_FADE_DURATION;
  const features = ringEvents.map((event) => {
    let startTime = startTimes.get(event.id);
    if (startTime === undefined) {
      startTime = now;
      startTimes.set(event.id, startTime);
    }
    let t = (now - startTime) / 1000;
    if (t >= totalDuration) {
      startTimes.set(event.id, now);
      t = 0;
    }
    let radius = 0;
    let opacity = 1;
    if (t < RING_EXPAND_DURATION) {
      radius = (t / RING_EXPAND_DURATION) * RING_MAX_RADIUS;
      opacity = 1;
    } else if (t < totalDuration) {
      radius = RING_MAX_RADIUS;
      opacity = 1 - (t - RING_EXPAND_DURATION) / RING_FADE_DURATION;
    }
    const coords = getEventCoordinates(event)!;
    return {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: coords },
      properties: { eventId: event.id, radius, opacity },
    };
  });
  return { type: "FeatureCollection", features };
}

const MARKER_LAYER_IDS = [
  EVENTS_LAYER_ID,
  EVENTS_CLUSTERS_LAYER_ID,
  ESCALATION_RINGS_LAYER_ID,
  ESCALATIONS_LAYER_ID,
];

export function WorldMap({
  accessToken,
  events,
  escalations = [],
  heatmap: _heatmap,
  crisisHeatmap,
  escalationRisk,
  showEscalationRiskLayer = false,
  onMarkerClick,
  onEscalationClick,
  initialBounds,
  centerOn,
  onCentered,
  onRegionClick,
}: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const eventsRef = useRef<MapMarkerItem[]>(events);
  const escalationsRef = useRef<EscalationMapItem[]>(escalations);
  const crisisHeatmapRef = useRef<CrisisHeatmapPoint[] | undefined>(crisisHeatmap);
  const countriesGeoJSONRef = useRef<{ type: "FeatureCollection"; features: GeoJSONFeature[] } | null>(null);
  const onMarkerClickRef = useRef(onMarkerClick);
  const onEscalationClickRef = useRef(onEscalationClick);
  const onRegionClickRef = useRef(onRegionClick);
  const startTimesRef = useRef<Map<string, number>>(new Map());
  eventsRef.current = events;
  escalationsRef.current = escalations;
  crisisHeatmapRef.current = crisisHeatmap;
  onMarkerClickRef.current = onMarkerClick;
  onEscalationClickRef.current = onEscalationClick;
  onRegionClickRef.current = onRegionClick;

  useEffect(() => {
    if (!containerRef.current || !accessToken) return;
    mapboxgl.accessToken = accessToken;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [0, 20],
      zoom: 2,
    });
    mapRef.current = map;

    map.on("load", () => {
      if (initialBounds) {
        map.fitBounds(initialBounds, { padding: 40, maxZoom: 12 });
      }
      const crisisPoints = crisisHeatmapRef.current ?? [];
      map.addSource(CRISIS_HEATMAP_SOURCE_ID, {
        type: "geojson",
        data: buildCrisisHeatmapGeoJSON(crisisPoints),
      });
      map.addSource(EVENTS_SOURCE_ID, {
        type: "geojson",
        data: buildEventsGeoJSON(eventsRef.current),
        cluster: true,
        clusterMaxZoom: 12,
        clusterRadius: 50,
        generateId: true,
      });
      map.addLayer({
        id: EVENTS_CLUSTERS_LAYER_ID,
        type: "circle",
        source: EVENTS_SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-radius": [
            "step",
            ["get", "point_count"],
            18,
            50,
            24,
            200,
            30,
          ],
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#2563eb",
            50,
            "#1d4ed8",
            200,
            "#1e40af",
          ],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#fff",
        },
      });
      map.addSource(ESCALATION_RISK_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer(
        {
          id: ESCALATION_RISK_LAYER_ID,
          type: "fill",
          source: ESCALATION_RISK_SOURCE_ID,
          layout: { visibility: "none" },
          paint: {
            "fill-color": [
              "match",
              ["get", "risk_level"],
              "Low",
              "#22c55e",
              "Medium",
              "#eab308",
              "High",
              "#f97316",
              "Critical",
              "#ef4444",
              "none",
              "rgba(200,200,200,0.2)",
              "rgba(0,0,0,0)",
            ],
            "fill-opacity": 0.4,
            "fill-outline-color": "rgba(120,120,120,0.4)",
          },
        },
        EVENTS_CLUSTERS_LAYER_ID
      );
      map.addLayer({
        id: EVENTS_CLUSTER_COUNT_LAYER_ID,
        type: "symbol",
        source: EVENTS_SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
          "text-font": ["DIN Pro Regular", "Arial Unicode MS Regular"],
        },
        paint: {
          "text-color": "#fff",
        },
      });
      map.addLayer({
        id: EVENTS_LAYER_ID,
        type: "circle",
        source: EVENTS_SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": ["get", "radius"],
          "circle-color": [
            "match",
            ["get", "category"],
            "Armed Conflict",
            "#dc2626",
            "Political Tension",
            "#ea580c",
            "Natural Disaster",
            "#2563eb",
            "Humanitarian Crisis",
            "#7c3aed",
            "#6b7280",
          ],
          "circle-opacity": ["get", "confidenceOpacity"],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#fff",
        },
      });
      map.addLayer(
        {
          id: CRISIS_HEATMAP_LAYER_ID,
          type: "heatmap",
          source: CRISIS_HEATMAP_SOURCE_ID,
          paint: {
            "heatmap-weight": ["get", "intensity"],
            "heatmap-radius": 25,
            "heatmap-opacity": 0.65,
            "heatmap-intensity": 1,
            "heatmap-color": [
              "interpolate",
              ["linear"],
              ["heatmap-density"],
              0,
              "rgba(0, 128, 0, 0)",
              0.2,
              "rgb(34, 197, 94)",
              0.4,
              "rgb(234, 179, 8)",
              0.6,
              "rgb(249, 115, 22)",
              0.8,
              "rgb(239, 68, 68)",
              1,
              "rgb(185, 28, 28)",
            ],
          },
        },
        EVENTS_CLUSTERS_LAYER_ID
      );
      map.on("click", EVENTS_CLUSTERS_LAYER_ID, (e) => {
        const feats = map.queryRenderedFeatures(e.point, {
          layers: [EVENTS_CLUSTERS_LAYER_ID],
        });
        const clusterId = feats[0]?.properties?.cluster_id;
        if (clusterId == null) return;
        const source = map.getSource(EVENTS_SOURCE_ID) as mapboxgl.GeoJSONSource;
        if (!source || typeof source.getClusterExpansionZoom !== "function")
          return;
        source.getClusterExpansionZoom(
          clusterId as number,
          (err, zoom) => {
            if (err || zoom == null) return;
            const geom = feats[0].geometry;
            if (geom.type !== "Point") return;
            map.easeTo({
              center: geom.coordinates.slice() as [number, number],
              zoom,
            });
          }
        );
      });
      map.on("mouseenter", EVENTS_CLUSTERS_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", EVENTS_CLUSTERS_LAYER_ID, () => {
        map.getCanvas().style.cursor = "default";
      });
      map.on("click", EVENTS_LAYER_ID, (e) => {
        const feats = map.queryRenderedFeatures(e.point, {
          layers: [EVENTS_LAYER_ID],
        });
        const props = feats[0]?.properties;
        const eventId = props?.eventId as string | undefined;
        if (eventId) {
          const event = eventsRef.current.find((ev) => ev.id === eventId);
          if (event) {
            const title = (props?.title ?? "Event") as string;
            const severity = (props?.severity ?? "—") as string;
            const confidenceLevel = (props?.confidenceLevel ?? "—") as string;
            const occurredAt = (props?.occurredAt ?? null) as string | null;
            const sourceCount = Number(props?.sourceCount ?? 0);
            const dateStr = occurredAt
              ? new Date(occurredAt).toLocaleDateString(undefined, {
                  dateStyle: "short",
                  timeStyle: "short",
                })
              : "—";
            const sourcesStr = sourceCount > 0 ? `${sourceCount} source(s)` : "—";
            const confColor = confidenceLevel === "High" ? "#059669" : confidenceLevel === "Medium" ? "#d97706" : "#dc2626";
            const confStyle = `display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:500;background:${confColor}20;color:${confColor}`;
            const popup = new mapboxgl.Popup({ maxWidth: "280px", closeButton: true })
              .setLngLat(e.lngLat)
              .setHTML(
                `<div class="p-1 text-left text-sm"><div class="font-medium">${escapeHtml(title)}</div><div class="mt-1 text-muted-foreground">Severity: ${escapeHtml(severity)} · Confidence: <span style="${confStyle}">${escapeHtml(confidenceLevel)}</span></div><div class="mt-0.5 text-muted-foreground">${escapeHtml(dateStr)} · ${sourcesStr}</div></div>`
              )
              .addTo(map);
            onMarkerClickRef.current(event);
          }
        }
      });
      map.getCanvas().style.cursor = "default";
      map.on("mouseenter", EVENTS_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", EVENTS_LAYER_ID, () => {
        map.getCanvas().style.cursor = "default";
      });

      const ringEvents = eventsRef.current.filter(
        (e) =>
          (e.severity === "High" || e.severity === "Critical") &&
          getEventCoordinates(e) != null
      );
      map.addSource(ESCALATION_RINGS_SOURCE_ID, {
        type: "geojson",
        data: buildEscalationRingsGeoJSON(
          ringEvents,
          startTimesRef.current,
          Date.now()
        ),
      });
      map.addLayer(
        {
          id: ESCALATION_RINGS_LAYER_ID,
          type: "circle",
          source: ESCALATION_RINGS_SOURCE_ID,
          paint: {
            "circle-radius": ["get", "radius"],
            "circle-opacity": ["get", "opacity"],
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ea580c",
            "circle-stroke-opacity": ["get", "opacity"],
          },
        },
        EVENTS_CLUSTERS_LAYER_ID
      );
      map.on("click", ESCALATION_RINGS_LAYER_ID, (e) => {
        const feats = map.queryRenderedFeatures(e.point, {
          layers: [ESCALATION_RINGS_LAYER_ID],
        });
        const eventId = feats[0]?.properties?.eventId as string | undefined;
        if (eventId) {
          const event = eventsRef.current.find((ev) => ev.id === eventId);
          if (event) onMarkerClickRef.current(event);
        }
      });
      map.on("mouseenter", ESCALATION_RINGS_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", ESCALATION_RINGS_LAYER_ID, () => {
        map.getCanvas().style.cursor = "default";
      });

      map.addSource(ESCALATIONS_SOURCE_ID, {
        type: "geojson",
        data: buildEscalationsGeoJSON(escalationsRef.current),
      });
      map.addLayer({
        id: ESCALATIONS_LAYER_ID,
        type: "circle",
        source: ESCALATIONS_SOURCE_ID,
        paint: {
          "circle-radius": 14,
          "circle-color": "#ea580c",
          "circle-opacity": 0.9,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
        },
      });
      map.on("click", ESCALATIONS_LAYER_ID, (e) => {
        const feats = map.queryRenderedFeatures(e.point, {
          layers: [ESCALATIONS_LAYER_ID],
        });
        const escalationId = feats[0]?.properties?.escalationId as string | undefined;
        if (escalationId && onEscalationClickRef.current) {
          const esc = escalationsRef.current.find((x) => x.id === escalationId);
          if (esc) onEscalationClickRef.current(esc);
        }
      });
      map.on("mouseenter", ESCALATIONS_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", ESCALATIONS_LAYER_ID, () => {
        map.getCanvas().style.cursor = "default";
      });

      map.on("click", (e) => {
        const features = map.queryRenderedFeatures(e.point);
        const hitMarker = features.some((f) => f.layer?.id && MARKER_LAYER_IDS.includes(f.layer.id));
        if (!hitMarker && onRegionClickRef.current) {
          onRegionClickRef.current({ lng: e.lngLat.lng, lat: e.lngLat.lat });
        }
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [accessToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource(EVENTS_SOURCE_ID)) return;
    const source = map.getSource(EVENTS_SOURCE_ID) as mapboxgl.GeoJSONSource;
    source.setData(buildEventsGeoJSON(events));
  }, [events]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource(ESCALATIONS_SOURCE_ID)) return;
    const source = map.getSource(ESCALATIONS_SOURCE_ID) as mapboxgl.GeoJSONSource;
    source.setData(buildEscalationsGeoJSON(escalations));
  }, [escalations]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource(CRISIS_HEATMAP_SOURCE_ID)) return;
    const source = map.getSource(CRISIS_HEATMAP_SOURCE_ID) as mapboxgl.GeoJSONSource;
    const points = crisisHeatmap ?? [];
    source.setData(buildCrisisHeatmapGeoJSON(points));
  }, [crisisHeatmap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer(ESCALATION_RISK_LAYER_ID)) return;
    map.setLayoutProperty(
      ESCALATION_RISK_LAYER_ID,
      "visibility",
      showEscalationRiskLayer ? "visible" : "none"
    );
  }, [showEscalationRiskLayer]);

  useEffect(() => {
    if (!showEscalationRiskLayer) return;
    const map = mapRef.current;
    const source = map?.getSource(ESCALATION_RISK_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (!map || !source) return;

    const riskList = escalationRisk ?? [];

    async function loadAndMerge() {
      let countries = countriesGeoJSONRef.current;
      if (!countries) {
        try {
          const res = await fetch("/data/countries.geojson");
          if (!res.ok) throw new Error("Not found");
          countries = await res.json();
        } catch {
          const res = await fetch(COUNTRIES_GEOJSON_URL);
          if (!res.ok) return;
          countries = await res.json();
        }
        countriesGeoJSONRef.current = countries;
      }
      if (!countries?.features?.length) return;
      const merged = mergeCountriesWithRisk(countries, riskList);
      if (source) source.setData(merged as Parameters<mapboxgl.GeoJSONSource["setData"]>[0]);
    }

    loadAndMerge();
  }, [showEscalationRiskLayer, escalationRisk]);

  useEffect(() => {
    let raf = 0;
    function tick() {
      const map = mapRef.current;
      if (!map?.getSource(ESCALATION_RINGS_SOURCE_ID)) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const ringEvents = eventsRef.current.filter(
        (e) =>
          (e.severity === "High" || e.severity === "Critical") &&
          getEventCoordinates(e) != null
      );
      const now = Date.now();
      const geo = buildEscalationRingsGeoJSON(
        ringEvents,
        startTimesRef.current,
        now
      );
      const source = map.getSource(
        ESCALATION_RINGS_SOURCE_ID
      ) as mapboxgl.GeoJSONSource;
      source.setData(geo);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !centerOn) return;
    map.flyTo({
      center: [centerOn.lng, centerOn.lat],
      zoom: centerOn.zoom ?? 10,
      duration: 1200,
    });
    const handleMoveEnd = () => {
      onCentered?.();
    };
    map.once("moveend", handleMoveEnd);
    return () => {
      map.off("moveend", handleMoveEnd);
    };
  }, [centerOn, onCentered]);

  return <div ref={containerRef} className="h-full w-full min-h-0" />;
}
