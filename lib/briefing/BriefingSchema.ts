import { z } from "zod";

/**
 * Zod schema for the briefing JSON stored in event_briefings.brief_json.
 * Validates output from placeholder generator and future LLM.
 */
export const BriefingSchema = z.object({
  summary: z.string(),
  key_points: z.array(z.string()),
});

export type Briefing = z.infer<typeof BriefingSchema>;
