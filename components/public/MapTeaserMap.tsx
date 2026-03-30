"use client";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
} from "react-leaflet";
import L from "leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { createMapClusterIcon } from "@/lib/mapClusterIcon";
import { getCategoryColor } from "@/lib/mapMarkerStyle";
import { TILE_CARTO_VOYAGER } from "@/lib/mapTiles";
import type { SimpleEvent } from "@/components/public/SimpleEventsMap";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

const DEFAULT_CENTER: [number, number] = [20, 0];
const DEFAULT_ZOOM = 2;

const iconCache = new Map<string, L.DivIcon>();

function getMarkerIcon(category: string | null | undefined): L.DivIcon {
  const color = getCategoryColor(category);
  if (iconCache.has(color)) return iconCache.get(color)!;
  const icon = L.divIcon({
    className: "simple-event-marker",
    html: `<div style="width:20px;height:20px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
  iconCache.set(color, icon);
  return icon;
}

type MapTeaserMapProps = {
  events: SimpleEvent[];
};

/** Read-only small map for homepage teaser: no zoom/attribution controls, ~400px height via parent. */
export function MapTeaserMap({ events }: MapTeaserMapProps) {
  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ height: "100%", width: "100%" }}
      zoomControl={false}
      attributionControl={false}
      scrollWheelZoom={false}
      dragging={true}
    >
      <TileLayer
        url={TILE_CARTO_VOYAGER.url}
        attribution={TILE_CARTO_VOYAGER.attribution}
        subdomains={TILE_CARTO_VOYAGER.subdomains}
        maxZoom={TILE_CARTO_VOYAGER.maxZoom}
      />
      <MarkerClusterGroup chunkedLoading iconCreateFunction={createMapClusterIcon}>
        {events.map((ev) => (
          <Marker
            key={ev.id}
            position={[ev.lat, ev.lon]}
            icon={getMarkerIcon(ev.category)}
          >
            <Popup>
              <div className="min-w-[180px] max-w-[280px] text-left">
                <div className="font-semibold text-sm mb-1">{ev.title || "Event"}</div>
                <div className="flex flex-wrap gap-1 mb-1">
                  {ev.category && (
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-xs text-white"
                      style={{ backgroundColor: getCategoryColor(ev.category) }}
                    >
                      {ev.category}
                    </span>
                  )}
                  {ev.confidence && (
                    <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-gray-200 text-gray-800">
                      {ev.confidence}
                    </span>
                  )}
                </div>
                {ev.summary && (
                  <p className="text-xs text-gray-700 line-clamp-3">{ev.summary}</p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
