/**
 * Request-scoped structured logger for API routes.
 * Logs to stdout/stderr as JSON lines; no external services.
 */

export type LogLevel = "info" | "warn" | "error";

export interface RequestLogContext {
  requestId: string;
  role?: string;
}

export interface RequestLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

function serialize(level: LogLevel, requestId: string, role: string | undefined, message: string, meta?: Record<string, unknown>): string {
  const payload: Record<string, unknown> = {
    level,
    requestId,
    message,
    timestamp: new Date().toISOString(),
  };
  if (role !== undefined) payload.role = role;
  if (meta && Object.keys(meta).length > 0) {
    for (const [k, v] of Object.entries(meta)) payload[k] = v;
  }
  return JSON.stringify(payload);
}

/**
 * Create a logger bound to this request's context. Use one per request.
 */
export function createRequestLogger(context: RequestLogContext): RequestLogger {
  const { requestId, role } = context;
  return {
    info(message: string, meta?: Record<string, unknown>) {
      // eslint-disable-next-line no-console
      console.log(serialize("info", requestId, role, message, meta));
    },
    warn(message: string, meta?: Record<string, unknown>) {
      // eslint-disable-next-line no-console
      console.warn(serialize("warn", requestId, role, message, meta));
    },
    error(message: string, meta?: Record<string, unknown>) {
      // eslint-disable-next-line no-console
      console.error(serialize("error", requestId, role, message, meta));
    },
  };
}
