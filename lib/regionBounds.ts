import { getEventCoordinates } from "./eventCoordinates";
import type { PublicEvent } from "./eventCoordinates";
import type { EscalationMapItem } from "@/components/public/WorldMap";

/** Mapbox fitBounds: [[west, south], [east, north]] */
export type Bounds = [[number, number], [number, number]];

const PADDING = 0.5;

/**
 * Returns bounds from events and escalations, or from a grid region string (grid_lat_lng).
 * Use for map initialBounds.
 */
export function getBoundsForRegion(
  region: string,
  events: PublicEvent[],
  escalations: EscalationMapItem[]
): Bounds | undefined {
  const points: [number, number][] = [];
  for (const e of events) {
    const c = getEventCoordinates(e);
    if (c) points.push(c);
  }
  for (const e of escalations) {
    if (
      e.centroid_lng != null &&
      e.centroid_lat != null &&
      Number.isFinite(e.centroid_lng) &&
      Number.isFinite(e.centroid_lat)
    ) {
      points.push([e.centroid_lng, e.centroid_lat]);
    }
  }
  if (points.length > 0) {
    const lngs = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    const minLng = Math.min(...lngs) - PADDING;
    const minLat = Math.min(...lats) - PADDING;
    const maxLng = Math.max(...lngs) + PADDING;
    const maxLat = Math.max(...lats) + PADDING;
    return [
      [minLng, minLat],
      [maxLng, maxLat],
    ];
  }
  const gridMatch = region.match(/^grid_(-?\d+\.?\d*)_(-?\d+\.?\d*)$/);
  if (gridMatch) {
    const lat = Number.parseFloat(gridMatch[1]);
    const lng = Number.parseFloat(gridMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const half = 0.25;
      return [
        [lng - half, lat - half],
        [lng + half, lat + half],
      ];
    }
  }
  return undefined;
}
