/**
 * Central category/subtype mapping for ingestion and re-categorization.
 * Applies explicit rules: fire/wildfire/FIRMS → Natural Disaster / Wildfire;
 * flood / GDACS flood → Flood; ReliefWeb type tags; fallback with warning.
 */

import type { event_category, event_subtype } from "@/app/api/_lib/enums";

export type EventCategory = (typeof event_category)[number];
export type EventSubtype = (typeof event_subtype)[number];

export type CategoryMappingInput = {
  title: string;
  summary?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  feed_key?: string | null;
  category: string;
  subtype?: string | null;
  /** Optional raw payload (e.g. ReliefWeb fields.type, GDACS URL params). */
  raw?: unknown;
};

export type CategoryMappingResult = {
  category: EventCategory;
  subtype: EventSubtype | null;
};

export type CategoryMappingLog = {
  warn: (msg: string, meta?: Record<string, unknown>) => void;
};

const NATURAL_DISASTER: EventCategory = "Natural Disaster";
const HUMANITARIAN_CRISIS: EventCategory = "Humanitarian Crisis";

const VALID_CATEGORIES: Set<string> = new Set([
  "Armed Conflict",
  "Political Tension",
  "Military Posture",
  "Diplomatic Confrontation",
  "Coercive Economic Action",
  "Natural Disaster",
  "Humanitarian Crisis",
]);

const VALID_SUBTYPES: Set<string> = new Set([
  "Battle",
  "Targeted Assassination",
  "Air Strike",
  "Border Skirmish",
  "Protest",
  "Legislation Dispute",
  "Government Crisis",
  "Earthquake",
  "Flood",
  "Cyclone",
  "Drought",
  "Wildfire",
  "Food Crisis",
  "Population Displacement",
  "Disease Outbreak",
]);

function toCategory(s: string): EventCategory {
  return VALID_CATEGORIES.has(s) ? (s as EventCategory) : NATURAL_DISASTER;
}

function toSubtype(s: string): EventSubtype | null {
  return VALID_SUBTYPES.has(s) ? (s as EventSubtype) : null;
}

/** Keywords that imply wildfire → Natural Disaster / Wildfire. */
const WILDFIRE_KEYWORDS = ["fire", "wildfire", "burn", "nasa firms"];

/** Check if combined text suggests wildfire. */
function suggestsWildfire(text: string): boolean {
  const lower = text.toLowerCase();
  return WILDFIRE_KEYWORDS.some((k) => lower.includes(k));
}

/** Check if combined text or context suggests flood. */
function suggestsFlood(text: string, feedKey?: string | null): boolean {
  const lower = text.toLowerCase();
  if (lower.includes("flood") || lower.includes("flash flood")) return true;
  if (feedKey?.toLowerCase().includes("gdacs")) {
    if (lower.includes("fl") || lower.includes("flood")) return true;
  }
  return false;
}

/** GDACS eventtype code FL = Flood. */
function isGdacsFloodCode(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  const eventtype = String(o.eventtype ?? o.event_type ?? "").toUpperCase();
  return eventtype === "FL";
}

/** Extract ReliefWeb type names from raw (v2 API fields.type array). */
function getReliefWebTypes(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const o = raw as Record<string, unknown>;
  const fields = o.fields as Record<string, unknown> | undefined;
  const typeArr = (fields?.type ?? o.type) as Array<{ name?: string }> | undefined;
  if (!Array.isArray(typeArr)) return [];
  return typeArr.map((t) => String(t?.name ?? "").trim()).filter(Boolean);
}

/** Map ReliefWeb type name to our subtype (v2 API tags). */
function reliefWebTypeToSubtype(typeName: string): EventSubtype | null {
  const lower = typeName.toLowerCase();
  if (lower.includes("famine") || lower.includes("food security") || lower.includes("food crisis")) return "Food Crisis";
  if (lower.includes("displacement") || lower.includes("refugee")) return "Population Displacement";
  if (lower.includes("flood") || lower.includes("flash flood")) return "Flood";
  if (lower.includes("drought")) return "Drought";
  if (lower.includes("epidemic") || lower.includes("disease") || lower.includes("outbreak")) return "Disease Outbreak";
  if (lower.includes("fire") || lower.includes("wildfire")) return "Wildfire";
  return null;
}

/**
 * Normalize category and subtype from ingest item or event row.
 * Applies: fire/wildfire/FIRMS → Natural Disaster / Wildfire; flood / GDACS FL → Flood;
 * ReliefWeb type field; fallback with logged warning on mismatch.
 */
export function normalizeCategoryAndSubtype(
  input: CategoryMappingInput,
  log?: CategoryMappingLog
): CategoryMappingResult {
  const { title, summary, source_name, source_url, feed_key, category, subtype, raw } = input;
  const combined = [title, summary ?? "", source_name ?? "", source_url ?? "", feed_key ?? ""].join(" ");

  let outCategory = toCategory(category);
  let outSubtype = subtype ? toSubtype(subtype) : null;

  // 1) Fire / wildfire / burn / NASA FIRMS → Natural Disaster, Wildfire
  if (suggestsWildfire(combined)) {
    outCategory = NATURAL_DISASTER;
    outSubtype = "Wildfire";
    return { category: outCategory, subtype: outSubtype };
  }

  // 2) ReliefWeb: parse type field from v2 API (fields.type array)
  const rwTypes = getReliefWebTypes(raw);
  if (rwTypes.length > 0) {
    const rwSubtype = reliefWebTypeToSubtype(rwTypes[0]);
    if (rwSubtype) {
      outCategory = rwSubtype === "Wildfire" ? NATURAL_DISASTER : HUMANITARIAN_CRISIS;
      outSubtype = rwSubtype;
      return { category: outCategory, subtype: outSubtype };
    }
  }

  // 3) Flood: GDACS flood code or "flood" in text → subtype Flood
  if (suggestsFlood(combined, feed_key) || isGdacsFloodCode(raw)) {
    if (outCategory === NATURAL_DISASTER || outCategory === HUMANITARIAN_CRISIS) {
      outSubtype = "Flood";
    } else {
      outCategory = NATURAL_DISASTER;
      outSubtype = "Flood";
    }
    return { category: outCategory, subtype: outSubtype };
  }

  // 4) Fallback: if current subtype doesn't match category or we detect a keyword mismatch, try parsed keyword and log
  const keywordSubtype = inferSubtypeFromText(combined);
  if (keywordSubtype && keywordSubtype !== outSubtype) {
    const validForCategory = subtypeValidForCategory(outCategory, keywordSubtype);
    if (validForCategory) {
      log?.warn("Category mapping: subtype mismatch, using parsed keyword", {
        previous: outSubtype,
        inferred: keywordSubtype,
        title: title.slice(0, 80),
      });
      outSubtype = keywordSubtype;
    }
  }

  return {
    category: outCategory,
    subtype: outSubtype,
  };
}

/** Infer subtype from text (e.g. earthquake, cyclone, drought, flood, wildfire). */
function inferSubtypeFromText(text: string): EventSubtype | null {
  const lower = text.toLowerCase();
  if (lower.includes("earthquake") || lower.includes("quake")) return "Earthquake";
  if (lower.includes("cyclone") || lower.includes("hurricane") || lower.includes("typhoon")) return "Cyclone";
  if (lower.includes("drought")) return "Drought";
  if (lower.includes("flood")) return "Flood";
  if (lower.includes("wildfire") || lower.includes("wild fire") || lower.includes("brush fire")) return "Wildfire";
  return null;
}

function subtypeValidForCategory(cat: EventCategory, sub: EventSubtype): boolean {
  const natural: EventSubtype[] = ["Earthquake", "Flood", "Cyclone", "Drought", "Wildfire"];
  const humanitarian: EventSubtype[] = ["Food Crisis", "Population Displacement", "Flood", "Drought", "Disease Outbreak"];
  if (cat === NATURAL_DISASTER) return natural.includes(sub);
  if (cat === HUMANITARIAN_CRISIS) return humanitarian.includes(sub);
  return true;
}
