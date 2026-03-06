import { supabaseAdmin } from "@/app/api/_lib/db";
import { getSequenceKey } from "./sequenceKey";

type EventRow = {
  id: string;
  category: string;
  subtype: string | null;
  severity: string;
  outcome: string | null;
};

/**
 * Updates event_sequences for the given event: increments count for the
 * (sequence_key, outcome) row. If previousOutcome is provided, decrements
 * the previous outcome count first. No-op if event has no outcome.
 */
export async function updateSequenceStatsForEvent(
  eventId: string,
  previousOutcome?: string | null
): Promise<void> {
  const { data: event, error: fetchError } = await supabaseAdmin
    .from("events")
    .select("id, category, subtype, severity, outcome")
    .eq("id", eventId)
    .single();

  if (fetchError || !event) {
    return;
  }

  const row = event as unknown as EventRow;
  const outcome = row.outcome?.trim();
  const prev = previousOutcome != null ? String(previousOutcome).trim() : "";

  if (outcome) {
    const sequenceKey = getSequenceKey(row.category, row.subtype, row.severity);
    const category = String(row.category ?? "").trim();
    const subtype = (row.subtype ?? "").trim() || null;
    const severityPattern = String(row.severity ?? "").trim();

    if (prev !== "" && prev !== outcome) {
      const { data: prevRow } = await supabaseAdmin
        .from("event_sequences")
        .select("id, count")
        .eq("sequence_key", sequenceKey)
        .eq("outcome", prev)
        .maybeSingle();
      if (prevRow && (prevRow as { count: number }).count > 0) {
        await supabaseAdmin
          .from("event_sequences")
          .update({
            count: (prevRow as { count: number }).count - 1,
            updated_at: new Date().toISOString(),
          })
          .eq("sequence_key", sequenceKey)
          .eq("outcome", prev);
      }
    }

    const { data: existing } = await supabaseAdmin
      .from("event_sequences")
      .select("id, count")
      .eq("sequence_key", sequenceKey)
      .eq("outcome", outcome)
      .maybeSingle();

    const now = new Date().toISOString();
    if (existing) {
      await supabaseAdmin
        .from("event_sequences")
        .update({
          count: (existing as { count: number }).count + 1,
          updated_at: now,
        })
        .eq("sequence_key", sequenceKey)
        .eq("outcome", outcome);
    } else {
      await supabaseAdmin.from("event_sequences").insert({
        sequence_key: sequenceKey,
        category,
        subtype,
        severity_pattern: severityPattern,
        outcome,
        count: 1,
        updated_at: now,
      });
    }
    return;
  }

  if (prev !== "") {
    const sequenceKey = getSequenceKey(row.category, row.subtype, row.severity);
    const { data: prevRow } = await supabaseAdmin
      .from("event_sequences")
      .select("id, count")
      .eq("sequence_key", sequenceKey)
      .eq("outcome", prev)
      .maybeSingle();
    if (prevRow && (prevRow as { count: number }).count > 0) {
      await supabaseAdmin
        .from("event_sequences")
        .update({
          count: (prevRow as { count: number }).count - 1,
          updated_at: new Date().toISOString(),
        })
        .eq("sequence_key", sequenceKey)
        .eq("outcome", prev);
    }
  }
}
