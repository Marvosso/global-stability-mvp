/**
 * Shared Leaflet raster basemaps (public map + homepage teaser).
 * Attributions required by providers — keep on TileLayer.
 */

export const TILE_CARTO_VOYAGER = {
  url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  subdomains: "abcd" as const,
  maxZoom: 20,
} as const;

export const TILE_OSM = {
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  subdomains: "abc" as const,
  maxZoom: 19,
} as const;

export const TILE_ESRI_IMAGERY = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution:
    "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  maxZoom: 19,
} as const;

export const TILE_TOPO = {
  url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
  attribution:
    'Map: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, <a href="http://viewfinderpanoramas.org">SRTM</a> | Style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
  subdomains: "abc" as const,
  maxZoom: 17,
} as const;
