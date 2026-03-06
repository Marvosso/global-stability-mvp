import { createDraftEventSchema, ingestBatchSchema } from "../../_lib/validation";
import type { IngestItem } from "../../_lib/validation";
import { createDraftEventAndMaybeCandidate, CreateDraftEventError } from "../../_lib/createDraftEvent";
import { processIngestBatch } from "../../_lib/processIngestBatch";
import { createRequestLogger } from "@/lib/logger";
import {
  badRequest,
  internalError,
  errorResponse,
  unauthorized,
} from "@/lib/apiError";
import { NextRequest, NextResponse } from "next/server";

const INGEST_API_KEY = process.env.INGEST_API_KEY;

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = createRequestLogger({ requestId });

  if (!INGEST_API_KEY || INGEST_API_KEY.length === 0) {
    log.warn("Ingest not configured: INGEST_API_KEY missing");
    return NextResponse.json(
      { error: "Ingest not configured" },
      { status: 503 }
    );
  }

  const key = request.headers.get("x-ingest-key");
  if (key !== INGEST_API_KEY) {
    log.warn("Ingest unauthorized: invalid or missing x-ingest-key");
    return unauthorized("Invalid or missing x-ingest-key");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    log.warn("Invalid JSON");
    return badRequest("Invalid JSON");
  }

  // Batch ingest: { items: [...] }
  if (typeof body === "object" && body !== null && Array.isArray((body as { items?: unknown }).items)) {
    const parsed = ingestBatchSchema.safeParse(body);
    if (!parsed.success) {
      log.warn("Batch validation failed", { path: "body.items" });
      return badRequest("Validation failed", parsed.error.flatten());
    }
    const { items } = parsed.data;
    const feedKey = items[0]?.feed_key ?? items[0]?.source_name ?? "unknown";

    const { processed, skipped } = await processIngestBatch(feedKey, items, log);

    return NextResponse.json({ processed, skipped });
  }

  // Single draft (legacy)
  const parsed = createDraftEventSchema.safeParse(body);
  if (!parsed.success) {
    log.warn("Validation failed", { path: "body" });
    return badRequest("Validation failed", parsed.error.flatten());
  }

  try {
    const { event } = await createDraftEventAndMaybeCandidate({
      data: parsed.data,
      createdBy: null,
    });
    log.info("Ingest draft created", { eventId: event.id });
    return NextResponse.json(event, { status: 201 });
  } catch (err) {
    if (err instanceof CreateDraftEventError) {
      log.error("Ingest create failed", { error: err.message, status: err.status });
      return errorResponse(err.status, err.message);
    }
    log.error("Ingest create failed", {
      error: err instanceof Error ? err.message : "Unknown",
    });
    return internalError("Failed to create draft");
  }
}
