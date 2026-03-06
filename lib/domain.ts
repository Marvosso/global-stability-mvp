import { parse } from "tldts";

/**
 * Normalize a URL or hostname to its registrable domain (eTLD+1), e.g.
 *   https://earthquake.usgs.gov/... -> usgs.gov
 *   http://www.gdacs.org/...       -> gdacs.org
 *
 * Returns null if the input cannot be parsed.
 */
export function normalizeDomainFromUrl(url: string): string | null {
  const raw = url?.trim();
  if (!raw) return null;

  // First, try tldts for robust eTLD+1 extraction.
  try {
    const parsed = parse(raw, { allowPrivateDomains: true });
    if (parsed.domain) {
      return parsed.domain.toLowerCase();
    }
  } catch {
    // fall through to URL-based fallback
  }

  // Fallback: rely on WHATWG URL parsing and strip a leading www.
  try {
    let candidate = raw;
    // Prepend a scheme if missing so new URL() can parse bare hostnames.
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
      candidate = `https://${candidate}`;
    }
    const u = new URL(candidate);
    let host = u.hostname.toLowerCase();
    if (host.startsWith("www.")) {
      host = host.slice(4);
    }
    return host || null;
  } catch {
    return null;
  }
}

