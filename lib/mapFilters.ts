import type { PublicEvent } from "./eventCoordinates";
import { getSeverityLevel } from "./mapMarkerStyle";

export type TimeWindow = "24h" | "72h" | "7d" | null;

export type MapFiltersState = {
  categories: string[];
  severityMin: number;
  severityMax: number;
  confidenceLevels: string[];
  timeWindow: TimeWindow;
};

export const DEFAULT_MAP_FILTERS: MapFiltersState = {
  categories: [],
  severityMin: 1,
  severityMax: 5,
  confidenceLevels: [],
  timeWindow: null,
};

/** Effective severity max: 5 is treated as 4 (Critical). */
function effectiveMax(max: number): number {
  return max >= 4 ? 4 : max;
}

export function applyMapFilters(
  events: PublicEvent[],
  filters: MapFiltersState
): PublicEvent[] {
  return events.filter((event) => {
    if (
      filters.categories.length > 0 &&
      !filters.categories.includes(event.category)
    ) {
      return false;
    }
    const level = getSeverityLevel(event.severity);
    const max = effectiveMax(filters.severityMax);
    if (level < filters.severityMin || level > max) return false;
    if (
      filters.confidenceLevels.length > 0 &&
      (!event.confidence_level ||
        !filters.confidenceLevels.includes(event.confidence_level))
    ) {
      return false;
    }
    if (filters.timeWindow) {
      const ts = new Date(event.occurred_at ?? event.created_at).getTime();
      const now = Date.now();
      const ms =
        filters.timeWindow === "24h"
          ? 24 * 60 * 60 * 1000
          : filters.timeWindow === "72h"
            ? 72 * 60 * 60 * 1000
            : 7 * 24 * 60 * 60 * 1000;
      if (ts < now - ms) return false;
    }
    return true;
  });
}

/** Count of active filters (non-default). */
export function countActiveFilters(f: MapFiltersState): number {
  let n = 0;
  if (f.categories.length > 0) n++;
  if (f.severityMin > 1 || f.severityMax < 5) n++;
  if (f.confidenceLevels.length > 0) n++;
  if (f.timeWindow != null) n++;
  return n;
}
