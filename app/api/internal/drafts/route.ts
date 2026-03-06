import { createDraftEventSchema } from "../../_lib/validation";
import {
  createDraftEventAndMaybeCandidate,
  CreateDraftEventError,
} from "../../_lib/createDraftEvent";
import { getUserRole } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import {
  badRequest,
  forbidden,
  internalError,
  unauthorized,
  errorResponse,
} from "@/lib/apiError";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const log = createRequestLogger({ requestId });
    log.warn("Invalid JSON");
    return badRequest("Invalid JSON");
  }

  const parsed = createDraftEventSchema.safeParse(body);
  if (!parsed.success) {
    const log = createRequestLogger({ requestId });
    log.warn("Validation failed", { path: "body" });
    return badRequest("Validation failed", parsed.error.flatten());
  }

  const ctx = await getUserRole(request);
  if (!ctx) {
    const log = createRequestLogger({ requestId });
    log.warn("Unauthorized");
    return unauthorized();
  }
  if (ctx.role !== "Admin" && ctx.role !== "AI") {
    const log = createRequestLogger({ requestId, role: ctx.role });
    log.warn("Forbidden");
    return forbidden();
  }

  const log = createRequestLogger({ requestId, role: ctx.role });

  try {
    const { event } = await createDraftEventAndMaybeCandidate({
      data: parsed.data,
      createdBy: ctx.userId,
    });
    log.info("Draft created", { eventId: event.id });
    return NextResponse.json(event, { status: 201 });
  } catch (err) {
    if (err instanceof CreateDraftEventError) {
      log.error("Draft create failed", { error: err.message, status: err.status });
      return errorResponse(err.status, err.message);
    }
    log.error("Draft create failed", { error: err instanceof Error ? err.message : "Unknown" });
    return internalError("Failed to create draft");
  }
}
