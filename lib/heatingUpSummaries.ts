import type { PublicEvent } from "./eventCoordinates";

const MS_24H = 24 * 60 * 60 * 1000;
const MS_7D = 7 * MS_24H;
const TOP_N = 5;

/** Normalize primary_location for grouping; treat empty or "lat,lng" as Unknown. */
export function normalizeRegion(loc: string | null | undefined): string {
  const s = loc?.trim();
  if (!s) return "Unknown";
  const parts = s.split(/[,;\s]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const a = Number.parseFloat(parts[0]);
    const b = Number.parseFloat(parts[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) return "Unknown";
  }
  return s;
}

function eventTime(ev: PublicEvent): number {
  return new Date(ev.created_at).getTime();
}

/** Events with created_at in [startMs, endMs). */
export function eventsInWindow(
  events: PublicEvent[],
  startMs: number,
  endMs: number
): PublicEvent[] {
  const result: PublicEvent[] = [];
  for (let i = 0; i < events.length; i++) {
    const t = eventTime(events[i]);
    if (t >= startMs && t < endMs) result.push(events[i]);
  }
  return result;
}

export type TopItem = { label: string; count: number };

/** Top categories by count in the given window (24h or 7d). */
export function topCategories(
  events: PublicEvent[],
  now: number,
  window: "24h" | "7d"
): TopItem[] {
  const start = window === "24h" ? now - MS_24H : now - MS_7D;
  const inWindow = eventsInWindow(events, start, now);
  const counts = new Map<string, number>();
  for (let i = 0; i < inWindow.length; i++) {
    const c = inWindow[i].category;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N);
}

/** Top regions by count (over last 7d). */
export function topRegions(
  events: PublicEvent[],
  now: number,
  window: "24h" | "7d" = "7d"
): TopItem[] {
  const start = window === "24h" ? now - MS_24H : now - MS_7D;
  const inWindow = eventsInWindow(events, start, now);
  const counts = new Map<string, number>();
  for (let i = 0; i < inWindow.length; i++) {
    const r = normalizeRegion(inWindow[i].primary_location);
    if (r === "Unknown") continue;
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N);
}

export type RisingItem = { label: string; delta: number };

/** Categories with more events in last 24h than in previous 24h. */
export function risingCategories(
  events: PublicEvent[],
  now: number
): RisingItem[] {
  const last24 = eventsInWindow(events, now - MS_24H, now);
  const prev24 = eventsInWindow(events, now - 2 * MS_24H, now - MS_24H);
  const countLast = new Map<string, number>();
  const countPrev = new Map<string, number>();
  for (let i = 0; i < last24.length; i++) {
    const c = last24[i].category;
    countLast.set(c, (countLast.get(c) ?? 0) + 1);
  }
  for (let i = 0; i < prev24.length; i++) {
    const c = prev24[i].category;
    countPrev.set(c, (countPrev.get(c) ?? 0) + 1);
  }
  const deltas: RisingItem[] = [];
  countLast.forEach((cnt, label) => {
    const prev = countPrev.get(label) ?? 0;
    const delta = cnt - prev;
    if (delta > 0) deltas.push({ label, delta });
  });
  return deltas.sort((a, b) => b.delta - a.delta).slice(0, TOP_N);
}

/** Regions with more events in last 24h than in previous 24h. */
export function risingRegions(events: PublicEvent[], now: number): RisingItem[] {
  const last24 = eventsInWindow(events, now - MS_24H, now);
  const prev24 = eventsInWindow(events, now - 2 * MS_24H, now - MS_24H);
  const countLast = new Map<string, number>();
  const countPrev = new Map<string, number>();
  for (let i = 0; i < last24.length; i++) {
    const r = normalizeRegion(last24[i].primary_location);
    if (r !== "Unknown") countLast.set(r, (countLast.get(r) ?? 0) + 1);
  }
  for (let i = 0; i < prev24.length; i++) {
    const r = normalizeRegion(prev24[i].primary_location);
    if (r !== "Unknown") countPrev.set(r, (countPrev.get(r) ?? 0) + 1);
  }
  const deltas: RisingItem[] = [];
  countLast.forEach((cnt, label) => {
    const prev = countPrev.get(label) ?? 0;
    const delta = cnt - prev;
    if (delta > 0) deltas.push({ label, delta });
  });
  return deltas.sort((a, b) => b.delta - a.delta).slice(0, TOP_N);
}
