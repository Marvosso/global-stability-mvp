import type { SupabaseClient } from "@supabase/supabase-js";

/** Table name for workflow audit log; override in tests if needed. */
export const WORKFLOW_AUDIT_TABLE = "workflow_audit_log" as const;

export type WorkflowAuditAction =
  | "draft_created"
  | "approved"
  | "rejected"
  | "confidence_updated";

export type EventStatus = "Draft" | "UnderReview" | "Published" | "Rejected";

export type ConfidenceLevel = "Low" | "Medium" | "High";

export interface DraftCreatedParams {
  eventId: string;
  actorId: string;
  actorRole?: string | null;
  details?: { title?: string } | null;
}

export interface ApprovalParams {
  eventId: string;
  actorId: string;
  actorRole?: string | null;
  previousStatus: EventStatus;
  nextStatus: EventStatus;
}

export interface RejectionParams {
  eventId: string;
  actorId: string;
  actorRole?: string | null;
  previousStatus: EventStatus;
}

export interface ConfidenceUpdateParams {
  eventId: string;
  actorId: string;
  actorRole?: string | null;
  previousScore?: number | null;
  previousLevel?: ConfidenceLevel | null;
  newScore: number;
  newLevel: ConfidenceLevel;
  justification: string;
}

type AuditRow = {
  event_id: string;
  action: WorkflowAuditAction;
  actor_id: string | null;
  actor_role: string | null;
  details: Record<string, unknown> | null;
};

function insertAudit(
  client: SupabaseClient,
  row: AuditRow
): ReturnType<ReturnType<SupabaseClient["from"]>["insert"]> {
  return client.from(WORKFLOW_AUDIT_TABLE).insert(row);
}

/**
 * Log workflow audit: draft created.
 * Call after successfully creating an event (e.g. POST internal/drafts).
 */
export function logDraftCreated(
  client: SupabaseClient,
  params: DraftCreatedParams
): ReturnType<ReturnType<SupabaseClient["from"]>["insert"]> {
  return insertAudit(client, {
    event_id: params.eventId,
    action: "draft_created",
    actor_id: params.actorId ?? null,
    actor_role: params.actorRole ?? null,
    details: params.details ?? null,
  });
}

/**
 * Log workflow audit: event approved (e.g. published or moved in review).
 * Call after successfully updating event status via approve flow.
 */
export function logApproval(
  client: SupabaseClient,
  params: ApprovalParams
): ReturnType<ReturnType<SupabaseClient["from"]>["insert"]> {
  return insertAudit(client, {
    event_id: params.eventId,
    action: "approved",
    actor_id: params.actorId ?? null,
    actor_role: params.actorRole ?? null,
    details: {
      previous_status: params.previousStatus,
      next_status: params.nextStatus,
    },
  });
}

/**
 * Log workflow audit: event rejected.
 * Call after successfully updating event status to Rejected.
 */
export function logRejection(
  client: SupabaseClient,
  params: RejectionParams
): ReturnType<ReturnType<SupabaseClient["from"]>["insert"]> {
  return insertAudit(client, {
    event_id: params.eventId,
    action: "rejected",
    actor_id: params.actorId ?? null,
    actor_role: params.actorRole ?? null,
    details: {
      previous_status: params.previousStatus,
    },
  });
}

/**
 * Log workflow audit: confidence recalculated/updated.
 * Call after successfully updating event confidence (e.g. via update_event_confidence RPC).
 * Field-level history remains in confidence_audit_log via DB trigger.
 */
export function logConfidenceUpdate(
  client: SupabaseClient,
  params: ConfidenceUpdateParams
): ReturnType<ReturnType<SupabaseClient["from"]>["insert"]> {
  return insertAudit(client, {
    event_id: params.eventId,
    action: "confidence_updated",
    actor_id: params.actorId ?? null,
    actor_role: params.actorRole ?? null,
    details: {
      previous_score: params.previousScore ?? null,
      previous_level: params.previousLevel ?? null,
      new_score: params.newScore,
      new_level: params.newLevel,
      justification: params.justification,
    },
  });
}
