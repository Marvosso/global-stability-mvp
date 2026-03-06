import type { PublicEvent } from "./eventCoordinates";

export type TimelineWindow = "24h" | "72h" | "7d" | "30d";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const TIMELINE_WINDOW_OPTIONS: { value: TimelineWindow; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "72h", label: "72h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

export function getTimelineWindowMs(window: TimelineWindow): number {
  switch (window) {
    case "24h":
      return 24 * HOUR_MS;
    case "72h":
      return 72 * HOUR_MS;
    case "7d":
      return 7 * DAY_MS;
    case "30d":
      return 30 * DAY_MS;
    default:
      return 72 * HOUR_MS;
  }
}

/**
 * Get event time in ms (occurred_at or created_at fallback).
 */
function getEventTime(event: PublicEvent): number {
  const raw = event.occurred_at ?? event.created_at;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Filter events to those within the timeline window and before the playhead.
 * position 0 = window start (no events), position 1 = now (all events in window).
 */
export function filterEventsByTimeline(
  events: PublicEvent[],
  window: TimelineWindow,
  position: number
): PublicEvent[] {
  const now = Date.now();
  const windowMs = getTimelineWindowMs(window);
  const windowStart = now - windowMs;
  const playheadTime = windowStart + position * windowMs;

  return events.filter((event) => {
    const t = getEventTime(event);
    if (t <= 0) return false;
    return t >= windowStart && t <= playheadTime;
  });
}
