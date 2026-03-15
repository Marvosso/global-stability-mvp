/**
 * Phase 15E: API key authentication for /api/v1/* (enterprise) and optional key + credits for /api/events.
 * Keys are passed via Authorization: Bearer <key> or X-API-Key: <key>.
 */

import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/api/_lib/db";

export const API_KEY_PREFIX_LENGTH = 16; // e.g. gs_live_ + 8 hex chars

/** Credits per tier per month (reset at credits_reset_at). */
export const CREDITS_PER_TIER: Record<string, number> = {
  free: 500,
  pro: 5000,
  enterprise: 50000,
};

export type ApiKeyContext = {
  userId: string;
  keyId: string;
  tier: string;
};

export type ApiKeyContextWithCredits = ApiKeyContext & {
  creditsRemaining: number;
};

/** SHA-256 hash of the raw key (hex string). */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** Extract API key from request: Authorization Bearer or X-API-Key header. */
export function getApiKeyFromRequest(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const key = authHeader.slice(7).trim();
    if (key.length > 0) return key;
  }
  const apiKeyHeader = request.headers.get("x-api-key");
  if (apiKeyHeader) {
    const key = apiKeyHeader.trim();
    if (key.length > 0) return key;
  }
  return null;
}

/**
 * Validates the API key and returns context. Throws on invalid/missing key or non-enterprise tier.
 * Lookup: use key prefix (first API_KEY_PREFIX_LENGTH chars), then verify key_hash.
 */
export async function requireApiKey(request: NextRequest): Promise<ApiKeyContext> {
  const rawKey = getApiKeyFromRequest(request);
  if (!rawKey || rawKey.length < API_KEY_PREFIX_LENGTH) {
    const err = Object.assign(new Error("Missing or invalid API key"), {
      status: 401 as const,
      code: "UNAUTHORIZED" as const,
    });
    throw err;
  }

  const keyPrefix = rawKey.slice(0, API_KEY_PREFIX_LENGTH);
  const keyHash = hashApiKey(rawKey);

  const { data: row, error } = await supabaseAdmin
    .from("api_keys")
    .select("id, user_id, tier")
    .eq("key_prefix", keyPrefix)
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error || !row) {
    const err = Object.assign(new Error("Invalid API key"), {
      status: 401 as const,
      code: "UNAUTHORIZED" as const,
    });
    throw err;
  }

  if (row.tier !== "enterprise") {
    const err = Object.assign(new Error("API key tier not allowed for this endpoint"), {
      status: 403 as const,
      code: "FORBIDDEN" as const,
    });
    throw err;
  }

  return {
    userId: row.user_id,
    keyId: row.id,
    tier: row.tier,
  };
}

type ApiKeyRow = {
  id: string;
  user_id: string;
  tier: string;
  credits_remaining: number;
  credits_reset_at: string | null;
};

/**
 * Optional API key validation for public endpoints (e.g. /api/events).
 * Returns context with credits, or null if no key / invalid key.
 * Resets credits_remaining when credits_reset_at is in the past (monthly reset).
 */
export async function getApiKeyContextOptional(
  request: NextRequest
): Promise<ApiKeyContextWithCredits | null> {
  const rawKey = getApiKeyFromRequest(request);
  if (!rawKey || rawKey.length < API_KEY_PREFIX_LENGTH) return null;

  const keyPrefix = rawKey.slice(0, API_KEY_PREFIX_LENGTH);
  const keyHash = hashApiKey(rawKey);

  const { data: row, error } = await supabaseAdmin
    .from("api_keys")
    .select("id, user_id, tier, credits_remaining, credits_reset_at")
    .eq("key_prefix", keyPrefix)
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error || !row) return null;

  const r = row as ApiKeyRow;
  let creditsRemaining = r.credits_remaining;

  if (r.credits_reset_at) {
    const resetAt = new Date(r.credits_reset_at).getTime();
    if (Date.now() >= resetAt) {
      const defaultCredits = CREDITS_PER_TIER[r.tier] ?? 500;
      const nextMonth = new Date();
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      nextMonth.setUTCDate(1);
      nextMonth.setUTCHours(0, 0, 0, 0);
      await supabaseAdmin
        .from("api_keys")
        .update({
          credits_remaining: defaultCredits,
          credits_reset_at: nextMonth.toISOString(),
        })
        .eq("id", r.id);
      creditsRemaining = defaultCredits;
    }
  }

  return {
    userId: r.user_id,
    keyId: r.id,
    tier: r.tier,
    creditsRemaining,
  };
}

/**
 * Decrement credits by 1 and log one row in api_usage. Call after a successful API response.
 * Uses RPC for atomic decrement; falls back to read-then-write if RPC is missing.
 */
export async function decrementCreditsAndLogUsage(
  keyId: string,
  endpoint: string,
  requestId?: string
): Promise<void> {
  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc("decrement_api_key_credits", {
    p_key_id: keyId,
  });
  if (rpcError != null) {
    const { data: keyRow } = await supabaseAdmin
      .from("api_keys")
      .select("credits_remaining")
      .eq("id", keyId)
      .single();
    const current = (keyRow as { credits_remaining: number } | null)?.credits_remaining ?? 0;
    await supabaseAdmin
      .from("api_keys")
      .update({ credits_remaining: Math.max(0, current - 1) })
      .eq("id", keyId);
  }
  await supabaseAdmin.from("api_usage").insert({
    api_key_id: keyId,
    endpoint,
    request_id: requestId ?? null,
    credits_used: 1,
  });
}
export function generateApiKeyValue(): { key: string; prefix: string; hash: string } {
  const secret = createHash("sha256")
    .update(Date.now().toString() + Math.random().toString())
    .digest("hex")
    .slice(0, 32);
  const key = `gs_live_${secret}`;
  const prefix = key.slice(0, API_KEY_PREFIX_LENGTH);
  const hash = hashApiKey(key);
  return { key, prefix, hash };
}
