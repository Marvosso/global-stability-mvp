/**
 * POST /api/internal/review/bulk-approve
 * Body: { feed_key?: string, ids?: string[] }. Approve all UnderReview events matching feed_key or in ids.
 * Auth: Admin and Reviewer only.
 */

import { supabaseAdmin } from "../../../_lib/db";
import { enforceWorkflowTransition } from "../../../_lib/workflow";
import { createAlertsForPublishedEvent } from "../../../_lib/createAlertsForPublishedEvent";
import { generateDraftBriefing } from "@/lib/briefing/generateDraftBriefing";
import { generateEventContextDraft } from "@/lib/context/generateEventContextDraft";
import { requireReviewer } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import {
  badRequest,
  internalError,
  responseFromThrown,
} from "@/lib/apiError";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  let ctx: { userId: string; role: "Admin" | "Reviewer" } | undefined;
  try {
    ctx = await requireReviewer(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    throw err;
  }

  const log = createRequestLogger({ requestId, role: ctx.role });
  let body: { feed_key?: string; ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const feedKey = typeof body.feed_key === "string" ? body.feed_key.trim() : null;
  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string") : null;

  if (!feedKey && (!ids || ids.length === 0)) {
    return badRequest("Provide feed_key or ids");
  }

  let query = supabaseAdmin
    .from("events")
    .select("id, status, requires_dual_review, last_reviewed_by")
    .eq("status", "UnderReview");

  if (feedKey) {
    query = query.eq("feed_key", feedKey);
  } else if (ids && ids.length > 0) {
    query = query.in("id", ids);
  }

  const { data: events, error: fetchError } = await query.limit(200);

  if (fetchError) {
    log.error("Bulk approve fetch failed", { error: fetchError.message });
    return internalError(fetchError.message);
  }

  const list = events ?? [];
  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const event of list) {
    try {
      const decision = enforceWorkflowTransition(
        {
          status: event.status,
          requires_dual_review: event.requires_dual_review ?? false,
          last_reviewed_by: event.last_reviewed_by,
        },
        ctx!.userId,
        "publish"
      );
      const updatePayload: { status: string; last_reviewed_by?: string } = {
        status: decision.nextStatus,
      };
      if (decision.updateLastReviewedBy) {
        updatePayload.last_reviewed_by = ctx!.userId;
      }
      const { error: updateError } = await supabaseAdmin
        .from("events")
        .update(updatePayload)
        .eq("id", event.id);

      if (updateError) {
        results.push({ id: event.id, ok: false, error: updateError.message });
        continue;
      }

      if (decision.nextStatus === "Published") {
        await createAlertsForPublishedEvent(event.id);
        generateDraftBriefing(event.id).catch(() => {});
        generateEventContextDraft(event.id, {
          skipIfApproved: true,
          skipIfRecentDraftMinutes: 10,
        }).catch(() => {});
      }
      results.push({ id: event.id, ok: true });
    } catch (err) {
      results.push({
        id: event.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const approved = results.filter((r) => r.ok).length;
  log.info("Bulk approve completed", { total: list.length, approved, feed_key: feedKey ?? undefined });
  return NextResponse.json({ approved, total: list.length, results });
}
