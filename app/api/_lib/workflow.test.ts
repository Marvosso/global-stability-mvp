import { describe, it, expect } from "vitest";
import { enforceWorkflowTransition } from "./workflow";
import type { WorkflowEventState } from "./workflow";

function state(
  overrides: Partial<WorkflowEventState> & { status: WorkflowEventState["status"] }
): WorkflowEventState {
  return {
    status: overrides.status,
    requires_dual_review: overrides.requires_dual_review ?? false,
    last_reviewed_by: overrides.last_reviewed_by ?? null,
  };
}

describe("enforceWorkflowTransition", () => {
  describe("UnderReview → Published", () => {
    it("allows publish when requires_dual_review is false", () => {
      const current = state({ status: "UnderReview", requires_dual_review: false, last_reviewed_by: null });
      const result = enforceWorkflowTransition(current, "A", "publish");
      expect(result).toEqual({ nextStatus: "Published", updateLastReviewedBy: true });
    });

    it("allows publish when requires_dual_review is true and last_reviewed_by is null", () => {
      const current = state({ status: "UnderReview", requires_dual_review: true, last_reviewed_by: null });
      const result = enforceWorkflowTransition(current, "A", "publish");
      expect(result).toEqual({ nextStatus: "Published", updateLastReviewedBy: true });
    });

    it("allows publish when a different reviewer performs it (dual review satisfied)", () => {
      const current = state({ status: "UnderReview", requires_dual_review: true, last_reviewed_by: "B" });
      const result = enforceWorkflowTransition(current, "A", "publish");
      expect(result).toEqual({ nextStatus: "Published", updateLastReviewedBy: true });
    });

    it("throws 400 when same reviewer tries to publish (dual review required)", () => {
      const current = state({ status: "UnderReview", requires_dual_review: true, last_reviewed_by: "A" });
      expect(() => enforceWorkflowTransition(current, "A", "publish")).toThrow(
        "Dual review required: final publish must be performed by a different reviewer."
      );
      expect(() => enforceWorkflowTransition(current, "A", "publish")).toThrow(
        expect.objectContaining({ status: 400 })
      );
    });
  });

  describe("UnderReview → Rejected", () => {
    it("allows reject when requires_dual_review is false", () => {
      const current = state({ status: "UnderReview", requires_dual_review: false, last_reviewed_by: null });
      const result = enforceWorkflowTransition(current, "A", "reject");
      expect(result).toEqual({ nextStatus: "Rejected", updateLastReviewedBy: true });
    });

    it("allows reject when a different reviewer performs it (dual review satisfied)", () => {
      const current = state({ status: "UnderReview", requires_dual_review: true, last_reviewed_by: "B" });
      const result = enforceWorkflowTransition(current, "A", "reject");
      expect(result).toEqual({ nextStatus: "Rejected", updateLastReviewedBy: true });
    });

    it("throws 400 when same reviewer tries to reject (dual review required)", () => {
      const current = state({ status: "UnderReview", requires_dual_review: true, last_reviewed_by: "A" });
      expect(() => enforceWorkflowTransition(current, "A", "reject")).toThrow(
        "Dual review required: final rejection must be performed by a different reviewer."
      );
      expect(() => enforceWorkflowTransition(current, "A", "reject")).toThrow(
        expect.objectContaining({ status: 400 })
      );
    });
  });

  describe("Published → Rejected (invalid)", () => {
    it("throws 400 for invalid transition from Published using action reject", () => {
      const current = state({ status: "Published", requires_dual_review: false, last_reviewed_by: null });
      expect(() => enforceWorkflowTransition(current, "A", "reject")).toThrow(
        "Invalid workflow transition from Published using action reject"
      );
      expect(() => enforceWorkflowTransition(current, "A", "reject")).toThrow(
        expect.objectContaining({ status: 400 })
      );
    });
  });

  describe("Rejected → Published (invalid)", () => {
    it("throws 400 for invalid transition from Rejected using action publish", () => {
      const current = state({ status: "Rejected", requires_dual_review: false, last_reviewed_by: null });
      expect(() => enforceWorkflowTransition(current, "A", "publish")).toThrow(
        "Invalid workflow transition from Rejected using action publish"
      );
      expect(() => enforceWorkflowTransition(current, "A", "publish")).toThrow(
        expect.objectContaining({ status: 400 })
      );
    });
  });
});
