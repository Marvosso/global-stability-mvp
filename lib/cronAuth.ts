/**
 * Shared cron auth: accepts x-cron-key or Authorization: Bearer <key>.
 * Uses CRON_SECRET (fallback to CRON_KEY for backward compatibility).
 */

import type { NextRequest } from "next/server";

export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 401; body: object };

export function verifyCronKey(request: NextRequest): CronAuthResult {
  const key = (process.env.CRON_SECRET ?? process.env.CRON_KEY ?? "").trim();
  if (!key) {
    return { ok: false, status: 401, body: { error: "CRON_SECRET not configured" } };
  }

  const headerKey = request.headers.get("x-cron-key");
  if (headerKey === key) {
    return { ok: true };
  }

  const authHeader = request.headers.get("authorization");
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch && bearerMatch[1]?.trim() === key) {
    return { ok: true };
  }

  return { ok: false, status: 401, body: { error: "Unauthorized" } };
}
