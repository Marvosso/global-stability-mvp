"use client";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  LayersControl,
} from "react-leaflet";
import L from "leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { getCategoryColor } from "@/lib/mapMarkerStyle";
import { createMapClusterIcon } from "@/lib/mapClusterIcon";
import {
  TILE_CARTO_VOYAGER,
  TILE_ESRI_IMAGERY,
  TILE_OSM,
  TILE_TOPO,
} from "@/lib/mapTiles";
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

const DEFAULT_CENTER: [number, number] = [20, 0];
const DEFAULT_ZOOM = 2;

const iconCache = new Map<string, L.DivIcon>();

function getMarkerIcon(category: string | null | undefined): L.DivIcon {
  const color = getCategoryColor(category);
  if (iconCache.has(color)) return iconCache.get(color)!;
  const icon = L.divIcon({
    className: "simple-event-marker",
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.45),inset 0 0 0 1px rgba(0,0,0,0.12)"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
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
      maxZoom={20}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
      className="gs-simple-map"
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Color streets (CARTO)">
          <TileLayer
            url={TILE_CARTO_VOYAGER.url}
            attribution={TILE_CARTO_VOYAGER.attribution}
            subdomains={TILE_CARTO_VOYAGER.subdomains}
            maxZoom={TILE_CARTO_VOYAGER.maxZoom}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite (Esri)">
          <TileLayer
            url={TILE_ESRI_IMAGERY.url}
            attribution={TILE_ESRI_IMAGERY.attribution}
            maxZoom={TILE_ESRI_IMAGERY.maxZoom}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Terrain (OpenTopo)">
          <TileLayer
            url={TILE_TOPO.url}
            attribution={TILE_TOPO.attribution}
            subdomains={TILE_TOPO.subdomains}
            maxZoom={TILE_TOPO.maxZoom}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="OpenStreetMap">
          <TileLayer
            url={TILE_OSM.url}
            attribution={TILE_OSM.attribution}
            subdomains={TILE_OSM.subdomains}
            maxZoom={TILE_OSM.maxZoom}
          />
        </LayersControl.BaseLayer>
      </LayersControl>
      <MarkerClusterGroup chunkedLoading iconCreateFunction={createMapClusterIcon}>
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
