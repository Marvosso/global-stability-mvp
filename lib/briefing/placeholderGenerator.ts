import type { BriefingInput } from "./buildInputs";
import type { Briefing } from "./BriefingSchema";
import { BriefingSchema } from "./BriefingSchema";

/**
 * Generates a minimal briefing from inputs without calling any external LLM.
 * Used as placeholder until a real model is wired.
 */
export function generatePlaceholderBriefing(inputs: BriefingInput): Briefing {
  const { event, sources, nearbySummaries } = inputs;
  const summary =
    event.summary && event.summary.length > 0
      ? event.summary.slice(0, 2000)
      : `${event.title}. ${event.category}${event.primary_location ? ` — ${event.primary_location}` : ""}`.trim();

  const keyPoints: string[] = [];
  if (event.category) keyPoints.push(`Category: ${event.category}`);
  if (event.primary_location) keyPoints.push(`Location: ${event.primary_location}`);
  if (event.country_code) keyPoints.push(`Country/region: ${event.country_code}`);
  if (event.severity) keyPoints.push(`Severity: ${event.severity}`);
  if (sources.length > 0) {
    keyPoints.push(`Sources: ${sources.map((s) => s.name).join(", ")}`);
  }
  if (nearbySummaries.length > 0) {
    keyPoints.push(
      `Related events in region (${nearbySummaries.length}): ${nearbySummaries.map((e) => e.title).join("; ").slice(0, 300)}`
    );
  }
  if (keyPoints.length === 0) keyPoints.push("No additional key points.");

  const result: Briefing = { summary, key_points: keyPoints };
  return BriefingSchema.parse(result);
}
