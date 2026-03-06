import { event_status } from "./enums";

export type EventStatus = (typeof event_status)[number];

export interface WorkflowEventState {
  status: EventStatus;
  requires_dual_review: boolean;
  last_reviewed_by: string | null;
}

export type ReviewAction = "request_changes" | "approve_for_review" | "publish" | "reject";

export interface WorkflowDecision {
  nextStatus: EventStatus;
  updateLastReviewedBy: boolean;
}

export function enforceWorkflowTransition(
  current: WorkflowEventState,
  actorId: string,
  action: ReviewAction
): WorkflowDecision {
  const { status, requires_dual_review, last_reviewed_by } = current;

  if (status === "Draft") {
    if (action === "approve_for_review") {
      return { nextStatus: "UnderReview", updateLastReviewedBy: true };
    }
  }

  if (status === "UnderReview") {
    if (action === "request_changes") {
      return { nextStatus: "Draft", updateLastReviewedBy: true };
    }

    if (action === "publish") {
      if (requires_dual_review && last_reviewed_by && last_reviewed_by === actorId) {
        throw Object.assign(
          new Error("Dual review required: final publish must be performed by a different reviewer."),
          { status: 400 as const }
        );
      }
      return { nextStatus: "Published", updateLastReviewedBy: true };
    }

    if (action === "reject") {
      if (requires_dual_review && last_reviewed_by && last_reviewed_by === actorId) {
        throw Object.assign(
          new Error("Dual review required: final rejection must be performed by a different reviewer."),
          { status: 400 as const }
        );
      }
      return { nextStatus: "Rejected", updateLastReviewedBy: true };
    }
  }

  throw Object.assign(new Error(`Invalid workflow transition from ${status} using action ${action}`), {
    status: 400 as const
  });
}

