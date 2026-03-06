import { supabaseAdmin } from "../../../_lib/db";
import { uuidSchema } from "../../../_lib/validation";
import { recalculateEventConfidence } from "../../../_lib/recalculateEventConfidence";
import { requireAdmin } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import {
  badRequest,
  notFound,
  internalError,
  responseFromThrown,
  forbidden,
} from "@/lib/apiError";
import { NextRequest, NextResponse } from "next/server";

const JUSTIFICATION = "Recalculated via POST /api/internal/confidence/:id";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();
  const idResult = uuidSchema.safeParse((await params)?.id);
  if (!idResult.success) {
    return badRequest("Invalid event id");
  }
  const id = idResult.data;

  let ctx;
  try {
    ctx = await requireAdmin(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    throw err;
  }

  const log = createRequestLogger({ requestId, role: ctx.role });
  const result = await recalculateEventConfidence(id, {
    justification: JUSTIFICATION,
    changedBy: ctx.userId,
  });

  if (!result.updated) {
    if (result.reason === "not_found") {
      log.warn("Event not found", { eventId: id });
      return notFound("Event not found");
    }
    if (result.reason === "published") {
      return forbidden("Confidence cannot be recalculated for published events");
    }
    log.error("Confidence update failed", { eventId: id });
    return internalError("Failed to update confidence");
  }

  log.info("Confidence updated", { eventId: id, score: result.score, level: result.level });
  return NextResponse.json({ id, confidence_score: result.score, confidence_level: result.level });
}
