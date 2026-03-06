/**
 * Template-based context builder for events.
 * Produces one_paragraph_summary, trigger, and background from event + sources.
 * No LLM calls; uses attribution and separates confirmed vs disputed where applicable.
 */

export type EventForContext = {
  id: string;
  title?: string | null;
  summary?: string | null;
  category?: string | null;
  severity?: string | null;
  occurred_at?: string | null;
  primary_location?: string | null;
  country_code?: string | null;
};

export type SourceForContext = {
  id: string;
  name: string | null;
  url?: string | null;
  claim_url?: string | null;
  raw_excerpt?: string | null;
  source_confidence_level?: string | null;
  reliability_tier?: string | null;
};

export type BuiltContext = {
  one_paragraph_summary: string;
  trigger: string | null;
  background: string;
};

const SUMMARY_CAP = 500;
const EXCERPT_CAP = 300;
const BACKGROUND_PLACEHOLDER = "Background context to be added.";

/** Tier order: higher first (High/Verified first, then lower/unverified). */
function sourceSortKey(s: SourceForContext): number {
  const tier = (s.reliability_tier ?? s.source_confidence_level ?? "").toString().toLowerCase();
  if (tier.includes("high") || tier.includes("verified") || tier.includes("tier1")) return 0;
  if (tier.includes("medium") || tier.includes("tier2")) return 1;
  return 2;
}

/**
 * Build context from event and attached sources.
 * Rules: no moral language, use attribution ("Source X reported …"), separate confirmed vs disputed.
 */
export function buildContext(
  event: EventForContext,
  sources: SourceForContext[]
): BuiltContext {
  const parts: string[] = [];

  // Title
  const title = (event.title ?? "").trim() || "Event";
  parts.push(title);
  if (!title.endsWith(".")) parts.push(".");

  // Event summary (one sentence, capped)
  const summary = (event.summary ?? "").trim();
  if (summary) {
    const sentence = summary.slice(0, SUMMARY_CAP).trim();
    if (sentence) {
      parts.push(" ");
      parts.push(sentence);
      if (!sentence.endsWith(".")) parts.push(".");
    }
  }

  // Sort sources: higher reliability first
  const sorted = [...sources].sort((a, b) => sourceSortKey(a) - sourceSortKey(b));
  const highConfidence = sorted.filter((s) => sourceSortKey(s) === 0);
  const other = sorted.filter((s) => sourceSortKey(s) > 0);

  // Attribution sentences: high-confidence first
  for (const s of highConfidence) {
    const name = (s.name ?? "").trim() || "A source";
    const excerpt = (s.raw_excerpt ?? "").trim().slice(0, EXCERPT_CAP).trim();
    if (excerpt) {
      parts.push(" According to ");
      parts.push(name);
      parts.push(", ");
      parts.push(excerpt);
      if (!excerpt.endsWith(".")) parts.push(".");
    } else {
      parts.push(" ");
      parts.push(name);
      parts.push(" cited this event.");
    }
  }

  // Other / unverified reports
  if (other.length > 0) {
    const names = other.map((s) => (s.name ?? "").trim() || "a source").filter(Boolean);
    const nameList = names.length > 0 ? names.join(" and ") : "Other reports";
    parts.push(" Unverified or conflicting reports from ");
    parts.push(nameList);
    parts.push(" suggest further details may differ.");
  }

  const one_paragraph_summary = parts.join("").trim() || title + ".";

  return {
    one_paragraph_summary,
    trigger: null,
    background: BACKGROUND_PLACEHOLDER,
  };
}
