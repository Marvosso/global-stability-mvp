import { NextResponse } from "next/server";

/** Standard JSON body for all API error responses. */
export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: unknown;
}

const CODES = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  CONFLICT: "CONFLICT",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  UPGRADE_REQUIRED: "UPGRADE_REQUIRED",
  NOT_FOUND: "NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
} as const;

/**
 * Build a JSON error response with standard shape.
 */
export function errorResponse(
  status: number,
  message: string,
  options?: { code?: string; details?: unknown }
): NextResponse {
  const body: ApiErrorBody = { error: message };
  if (options?.code) body.code = options.code;
  if (options?.details !== undefined) body.details = options.details;
  return NextResponse.json(body, { status });
}

export function badRequest(message: string, details?: unknown): NextResponse {
  return errorResponse(400, message, {
    code: details !== undefined ? CODES.VALIDATION_FAILED : undefined,
    details,
  });
}

export function unauthorized(message = "Unauthorized"): NextResponse {
  return errorResponse(401, message, { code: CODES.UNAUTHORIZED });
}

export function forbidden(message = "Forbidden"): NextResponse {
  return errorResponse(403, message, { code: CODES.FORBIDDEN });
}

/** Premium feature gating: 403 with code UPGRADE_REQUIRED when user_role is free. */
export function upgradeRequired(message = "Upgrade required"): NextResponse {
  return errorResponse(403, message, { code: CODES.UPGRADE_REQUIRED });
}

export function notFound(message = "Not found"): NextResponse {
  return errorResponse(404, message, { code: CODES.NOT_FOUND });
}

export function internalError(message: string): NextResponse {
  return errorResponse(500, message, { code: CODES.INTERNAL_ERROR });
}

/** Rate limit exceeded (429). Optionally set Retry-After header (seconds). */
export function rateLimitExceeded(retryAfterSeconds?: number): NextResponse {
  const res = errorResponse(429, "Too Many Requests", {
    code: CODES.RATE_LIMIT_EXCEEDED,
  });
  if (retryAfterSeconds !== undefined && retryAfterSeconds >= 0) {
    res.headers.set("Retry-After", String(Math.ceil(retryAfterSeconds)));
  }
  return res;
}

/**
 * Map thrown errors (e.g. from requireReviewer, enforceWorkflowTransition) to a standard response.
 * Returns null if the error has no known status (caller should rethrow).
 */
export function responseFromThrown(err: unknown): NextResponse | null {
  const status = (err as { status?: number }).status;
  const code = (err as { code?: string }).code;
  if (status !== 400 && status !== 401 && status !== 403) return null;
  const message = err instanceof Error ? err.message : "Request failed";
  if (status === 403 && code === "UPGRADE_REQUIRED") {
    return errorResponse(403, message, { code: CODES.UPGRADE_REQUIRED });
  }
  return errorResponse(status, message, {
    code:
      status === 401
        ? CODES.UNAUTHORIZED
        : status === 403
          ? CODES.FORBIDDEN
          : undefined,
  });
}

/** Map Supabase error code to HTTP status: 400 for constraint violations, else 500. */
export function statusFromSupabaseError(code: string | undefined): number {
  return code === "23505" || code === "23503" ? 400 : 500;
}
