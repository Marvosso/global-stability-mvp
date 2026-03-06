/**
 * In-memory fixed-window rate limiter for public API.
 * Edge-safe; state is per process/instance.
 */

const DEFAULT_MAX = 60;
const DEFAULT_WINDOW_MS = 60_000;

function getConfig() {
  const max = process.env.RATE_LIMIT_PUBLIC_MAX;
  const windowMs = process.env.RATE_LIMIT_PUBLIC_WINDOW_MS;
  const windowSec = process.env.RATE_LIMIT_PUBLIC_WINDOW_SEC;
  return {
    maxRequests: max ? Math.max(1, parseInt(max, 10)) : DEFAULT_MAX,
    windowMs: windowMs
      ? Math.max(1000, parseInt(windowMs, 10))
      : windowSec
        ? Math.max(1, parseInt(windowSec, 10)) * 1000
        : DEFAULT_WINDOW_MS,
  };
}

const store = new Map<string, { count: number; windowStartMs: number }>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
}

/**
 * Check rate limit for the given key (e.g. client IP). Fixed window.
 * Returns allowed, remaining requests in current window, and reset time in ms.
 */
export function check(key: string): RateLimitResult {
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
