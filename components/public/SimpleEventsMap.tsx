"use client";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
} from "react-leaflet";
import L from "leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { getCategoryColor } from "@/lib/mapMarkerStyle";
import { formatRelativeTime } from "@/lib/relativeTime";

import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

export type SimpleEvent = {
  id: string;
  title: string;
  category: string | null;
  occurred_at: string | null;
  confidence: string | null;
  summary: string | null;
  sources: string[];
  lat: number;
  lon: number;
};

const DEFAULT_CENTER: [number, number] = [0, 0];
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

type SimpleEventsMapProps = {
  events: SimpleEvent[];
};

export function SimpleEventsMap({ events }: SimpleEventsMapProps) {
  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MarkerClusterGroup chunkedLoading>
        {events.map((ev) => (
          <Marker
            key={ev.id}
            position={[ev.lat, ev.lon]}
            icon={getMarkerIcon(ev.category)}
          >
            <Popup>
              <div className="min-w-[200px] max-w-[320px] text-left">
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
                <div className="text-xs text-gray-500 mb-1">
                  {formatRelativeTime(ev.occurred_at)}
                </div>
                {ev.summary && (
                  <p className="text-xs text-gray-700 mb-1 line-clamp-3">{ev.summary}</p>
                )}
                <div className="text-xs text-gray-500">
                  Sources: {ev.sources?.length ?? 0}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
