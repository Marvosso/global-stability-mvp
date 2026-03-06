import { uuidSchema } from "../../../../_lib/validation";
import { supabaseAdmin } from "../../../../_lib/db";
import { requireReviewer } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import {
  badRequest,
  internalError,
  responseFromThrown,
} from "@/lib/apiError";
import { NextRequest, NextResponse } from "next/server";

export type ConfidenceLogEntry = {
  id: string;
  changed_field: string;
  old_value: string | null;
  new_value: string;
  justification: string;
  changed_at: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = crypto.randomUUID();
  const idResult = uuidSchema.safeParse(params?.id);
  if (!idResult.success) {
    return badRequest("Invalid event id");
  }
  const id = idResult.data;

  let ctx;
  try {
    ctx = await requireReviewer(request);
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    throw err;
  }

  const log = createRequestLogger({ requestId, role: ctx.role });

  const { data: rows, error } = await supabaseAdmin
    .from("confidence_audit_log")
    .select("id, changed_field, old_value, new_value, justification, changed_at")
    .eq("event_id", id)
    .in("changed_field", ["confidence_score", "confidence_level"])
    .order("changed_at", { ascending: false });

  if (error) {
    log.error("Confidence log query failed", {
      error: error.message,
      eventId: id,
    });
    return internalError(error.message);
  }

  const entries: ConfidenceLogEntry[] = (rows ?? []).map(
    (row: {
      id: string;
      changed_field: string;
      old_value: string | null;
      new_value: string;
      justification: string;
      changed_at: string;
    }) => ({
    id: row.id,
    changed_field: row.changed_field,
    old_value: row.old_value ?? null,
    new_value: row.new_value ?? "",
    justification: row.justification ?? "",
    changed_at: row.changed_at,
  }));

  return NextResponse.json(entries);
}
