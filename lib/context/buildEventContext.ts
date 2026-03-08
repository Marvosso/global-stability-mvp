/**
 * Deterministic context builder for the Context Analysis layer.
 * Produces summary, why_it_matters, likely_driver, uncertainty_note from event + sources + nearby events.
 * No LLM calls; template-based and cautious.
 */

const SUMMARY_CAP = 500;
const WHY_IT_MATTERS_CAP = 500;
const LIKELY_DRIVER_CAP = 300;
const UNCERTAINTY_NOTE_CAP = 250;

export type EventForContext = {
  id: string;
  title?: string | null;
  category?: string | null;
  subtype?: string | null;
  severity?: string | null;
  confidence_level?: string | null;
  primary_location?: unknown;
  country_code?: string | null;
  occurred_at?: string | null;
};

export type RelatedSource = {
  id: string;
  name?: string | null;
  raw_excerpt?: string | null;
};

export type NearbyEvent = {
  id: string;
  title?: string | null;
  category?: string | null;
  subtype?: string | null;
  occurred_at?: string | null;
  country_code?: string | null;
};

export type BuiltEventContext = {
  summary: string;
  why_it_matters: string;
  likely_driver: string;
  uncertainty_note: string;
};

function cap(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const trimmed = t.slice(0, max).trim();
  const last = trimmed.lastIndexOf(" ");
  if (last > max * 0.7) return trimmed.slice(0, last) + ".";
  return trimmed + ".";
}

function formatLocation(countryCode: string | null | undefined, primaryLocation: unknown): string {
  if (countryCode?.trim()) return countryCode.trim();
  if (primaryLocation && typeof primaryLocation === "object" && "type" in primaryLocation) {
    const geo = primaryLocation as { type?: string; coordinates?: [number, number] };
    if (geo.type === "Point" && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2)
      return `at ${geo.coordinates[1]?.toFixed(2)}, ${geo.coordinates[0]?.toFixed(2)}`;
  }
  if (typeof primaryLocation === "string" && primaryLocation.trim()) return primaryLocation.trim();
  return "";
}

function formatDate(occurredAt: string | null | undefined): string {
  if (!occurredAt) return "";
  try {
    const d = new Date(occurredAt);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function buildSummary(event: EventForContext): string {
  const title = (event.title ?? "").trim() || "An event";
  const category = (event.category ?? "").trim() || "incident";
  const subtype = (event.subtype ?? "").trim();
  const loc = formatLocation(event.country_code, event.primary_location);
  const date = formatDate(event.occurred_at);

  const parts: string[] = [];
  parts.push(title);
  if (!title.endsWith(".")) parts.push(".");
  parts.push(" ");
  if (subtype) {
    parts.push(subtype);
    parts.push(" (");
    parts.push(category);
    parts.push("). ");
  } else {
    parts.push(category);
    parts.push(". ");
  }
  if (loc) {
    parts.push("Location: ");
    parts.push(loc);
    parts.push(". ");
  }
  if (date) {
    parts.push("Reported date: ");
    parts.push(date);
    parts.push(".");
  }

  return cap(parts.join(""), SUMMARY_CAP);
}

function buildWhyItMatters(event: EventForContext): string {
  const category = (event.category ?? "").trim().toLowerCase();
  const severity = (event.severity ?? "").trim().toLowerCase();

  const severityPhrase = severity === "critical" ? "High severity. " : severity === "high" ? "Significant severity. " : "";

  if (category.includes("armed conflict")) {
    return cap(
      severityPhrase +
        "Armed conflict events can indicate risk of escalation and impact on regional stability. Monitoring developments is important for assessing stability.",
      WHY_IT_MATTERS_CAP
    );
  }
  if (category.includes("political tension")) {
    return cap(
      severityPhrase +
        "Political tension may signal unrest, governance instability, or protest momentum. Context helps assess whether tensions are contained or escalating.",
      WHY_IT_MATTERS_CAP
    );
  }
  if (category.includes("natural disaster")) {
    return cap(
      severityPhrase +
        "Natural disasters can cause disruption, casualties, displacement, and damage to infrastructure. Scale and response affect regional stability and humanitarian needs.",
      WHY_IT_MATTERS_CAP
    );
  }
  if (category.includes("humanitarian crisis")) {
    return cap(
      severityPhrase +
        "Humanitarian crises affect population welfare and aid needs. Worsening conditions may require coordinated response and can interact with other instability factors.",
      WHY_IT_MATTERS_CAP
    );
  }
  if (category.includes("military") || category.includes("diplomatic") || category.includes("coercive")) {
    return cap(
      severityPhrase + "This type of event can affect regional dynamics and stability. Significance depends on scale and follow-on developments.",
      WHY_IT_MATTERS_CAP
    );
  }

  return cap(
    severityPhrase + "The event may have regional or humanitarian relevance depending on scale and context.",
    WHY_IT_MATTERS_CAP
  );
}

function buildLikelyDriver(event: EventForContext, nearbyEvents: NearbyEvent[]): string {
  const category = (event.category ?? "").trim().toLowerCase();
  const subtype = (event.subtype ?? "").trim().toLowerCase();

  const hasNearbyProtest =
    nearbyEvents.some(
      (e) => (e.category ?? "").toLowerCase().includes("political") && (e.subtype ?? "").toLowerCase().includes("protest")
    ) || nearbyEvents.some((e) => (e.subtype ?? "").toLowerCase().includes("protest"));
  const hasNearbyConflict = nearbyEvents.some((e) => (e.category ?? "").toLowerCase().includes("armed conflict"));
  const hasNearbyDisaster = nearbyEvents.some((e) => (e.category ?? "").toLowerCase().includes("natural disaster"));
  const hasNearbyHumanitarian = nearbyEvents.some((e) => (e.category ?? "").toLowerCase().includes("humanitarian"));

  if ((subtype.includes("protest") || category.includes("political")) && hasNearbyProtest) {
    return cap("Rising civil unrest in the region, with multiple related protest or tension events reported recently.", LIKELY_DRIVER_CAP);
  }
  if (
    (category.includes("earthquake") || category.includes("flood") || category.includes("wildfire") || category.includes("cyclone") || category.includes("drought")) ||
    subtype.includes("earthquake") ||
    subtype.includes("flood") ||
    subtype.includes("wildfire") ||
    subtype.includes("cyclone") ||
    subtype.includes("drought")
  ) {
    return cap("Environmental disruption; natural hazard driving the reported impact.", LIKELY_DRIVER_CAP);
  }
  if (category.includes("armed conflict") && hasNearbyConflict) {
    return cap("Ongoing regional security escalation, with multiple conflict-related events in the area.", LIKELY_DRIVER_CAP);
  }
  if (category.includes("humanitarian") && (hasNearbyDisaster || hasNearbyConflict || hasNearbyHumanitarian)) {
    return cap(
      "Worsening humanitarian conditions linked to recent instability, disasters, or conflict in the region.",
      LIKELY_DRIVER_CAP
    );
  }
  if (category.includes("armed conflict")) {
    return cap("Security incident in the region; context may be linked to broader conflict dynamics.", LIKELY_DRIVER_CAP);
  }
  if (category.includes("political") || subtype.includes("protest")) {
    return cap("Civil or political dynamics; may be part of broader unrest or governance tensions.", LIKELY_DRIVER_CAP);
  }
  if (category.includes("natural disaster") || category.includes("humanitarian")) {
    return cap("Event driven by environmental or humanitarian factors in the region.", LIKELY_DRIVER_CAP);
  }

  return cap(
    "The immediate driver remains unclear based on currently available reporting.",
    LIKELY_DRIVER_CAP
  );
}

function buildUncertaintyNote(confidenceLevel: string | null | undefined): string {
  const level = (confidenceLevel ?? "").trim().toLowerCase();

  if (level === "low") {
    return cap(
      "Limited corroboration available. Reporting may change as more sources are verified or updated.",
      UNCERTAINTY_NOTE_CAP
    );
  }
  if (level === "medium") {
    return cap("The situation is still developing. Additional reporting may refine the classification or details.", UNCERTAINTY_NOTE_CAP);
  }
  if (level === "high") {
    return cap("Multiple corroborating reports support the event classification and basic details.", UNCERTAINTY_NOTE_CAP);
  }

  return cap("Confidence level not specified; interpretation should account for possible gaps in reporting.", UNCERTAINTY_NOTE_CAP);
}

/**
 * Build deterministic context (summary, why_it_matters, likely_driver, uncertainty_note) from
 * event, linked sources, and nearby events. No LLM; no hallucinated actors or causation.
 */
export function buildEventContext(
  event: EventForContext,
  _relatedSources: RelatedSource[],
  nearbyEvents: NearbyEvent[]
): BuiltEventContext {
  return {
    summary: buildSummary(event),
    why_it_matters: buildWhyItMatters(event),
    likely_driver: buildLikelyDriver(event, nearbyEvents),
    uncertainty_note: buildUncertaintyNote(event.confidence_level),
  };
}
