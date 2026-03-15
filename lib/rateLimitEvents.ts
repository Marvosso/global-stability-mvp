/**
 * In-memory rate limiter for public /api/events endpoint.
 * 100 requests per IP per hour (configurable via env).
 */

const DEFAULT_MAX = 100;
const DEFAULT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function getConfig() {
  const max = process.env.RATE_LIMIT_EVENTS_MAX;
  const windowMs = process.env.RATE_LIMIT_EVENTS_WINDOW_MS;
  return {
    maxRequests: max ? Math.max(1, parseInt(max, 10)) : DEFAULT_MAX,
    windowMs: windowMs ? Math.max(60_000, parseInt(windowMs, 10)) : DEFAULT_WINDOW_MS,
  };
}

const store = new Map<string, { count: number; windowStartMs: number }>();

export interface RateLimitEventsResult {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
}

export function checkEvents(key: string): RateLimitEventsResult {
  const { maxRequests, windowMs } = getConfig();
  const now = Date.now();
  const entry = store.get(key);

  if (!entry) {
    store.set(key, { count: 1, windowStartMs: now });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAtMs: now + windowMs,
    };
  }

  const elapsed = now - entry.windowStartMs;
  if (elapsed >= windowMs) {
    entry.count = 1;
    entry.windowStartMs = now;
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAtMs: now + windowMs,
    };
  }

  entry.count += 1;
  const allowed = entry.count <= maxRequests;
  const resetAtMs = entry.windowStartMs + windowMs;
  return {
    allowed,
    remaining: Math.max(0, maxRequests - entry.count),
    resetAtMs,
  };
}
