"use client";

import { useEffect, useRef } from "react";
import {
  getEventCoordinates,
  type PublicMapItem,
} from "@/lib/eventCoordinates";
import { getCategoryColor } from "@/lib/mapMarkerStyle";
import type { MapMarkerItem } from "./WorldMap";

type PublicMapLeafletProps = {
  events: MapMarkerItem[];
  onMarkerClick: (item: MapMarkerItem) => void;
  /** When user clicks map background (not a marker), called with click lng/lat for region event list */
  onRegionClick?: (lngLat: { lng: number; lat: number }) => void;
};

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Leaflet fallback when NEXT_PUBLIC_MAPBOX_TOKEN is not set. Uses ingestion coords (primary_location). */
export function PublicMapLeaflet({ events, onMarkerClick, onRegionClick }: PublicMapLeafletProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const onRegionClickRef = useRef(onRegionClick);
  onRegionClickRef.current = onRegionClick;
  type LeafletModule = typeof import("leaflet");
  const LRef = useRef<LeafletModule | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    (async () => {
      const mod = await import("leaflet");
      const L = (mod as unknown as { default?: typeof mod }).default ?? mod;
      if (cancelled || !containerRef.current) return;
      if (typeof document !== "undefined" && !document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
        link.crossOrigin = "anonymous";
        document.head.appendChild(link);
      }
      LRef.current = L as unknown as LeafletModule;
      const map = L.map(containerRef.current, {
        center: [20, 0],
        zoom: 2,
        zoomControl: true,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }).addTo(map);
      map.on("click", (e: L.LeafletMouseEvent) => {
        const target = (e as unknown as { originalEvent?: Event }).originalEvent?.target;
        if (target && typeof (target as Element).closest === "function" && (target as Element).closest(".leaflet-marker-icon"))
          return;
        const cb = onRegionClickRef.current;
        if (cb) {
          const { lat, lng } = e.latlng;
          cb({ lng, lat });
        }
      });
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      LRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    events.forEach((event) => {
      const coords = getEventCoordinates(event);
      if (!coords) return;
      const [lng, lat] = coords;
      const category = "category" in event ? event.category : null;
      const color = getCategoryColor(category);
      const title = "title" in event ? (event.title ?? "Event") : "Event";
      const severity = event.severity ?? "—";
      const confidenceLevel = event.confidence_level ?? "—";
      const occurredAt = "occurred_at" in event ? event.occurred_at : null;
      const sourceCount = "source_count" in event ? Number((event as PublicMapItem).source_count ?? 0) : 0;
      const dateStr = occurredAt
        ? new Date(occurredAt).toLocaleDateString(undefined, {
            dateStyle: "short",
            timeStyle: "short",
          })
        : "—";
      const sourcesStr = sourceCount > 0 ? `${sourceCount} source(s)` : "—";
      const confColor = confidenceLevel === "High" ? "#059669" : confidenceLevel === "Medium" ? "#d97706" : "#dc2626";
      const confStyle = `display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:500;background:${confColor}20;color:${confColor}`;
      const icon = L.divIcon({
        className: "leaflet-marker-custom",
        html: `<span style="background-color:${color};width:12px;height:12px;border-radius:50%;border:2px solid #fff;display:block;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></span>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      const marker = L.marker([lat, lng], { icon })
        .addTo(map)
        .on("click", () => onMarkerClick(event));
      marker.bindPopup(
        `<div class="p-2 text-left text-sm min-w-[200px]"><div class="font-medium">${escapeHtml(title)}</div><div class="mt-1 text-muted-foreground text-xs">Severity: ${escapeHtml(severity)} · Confidence: <span style="${confStyle}">${escapeHtml(confidenceLevel)}</span></div><div class="mt-0.5 text-muted-foreground text-xs">${escapeHtml(dateStr)} · ${sourcesStr}</div></div>`,
        { maxWidth: 280 }
      );
      markersRef.current.push(marker);
    });
  }, [events, onMarkerClick]);

  return <div ref={containerRef} className="h-full w-full min-h-0" />;
}
