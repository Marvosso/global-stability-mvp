/**
 * Phase 15E: API key authentication for enterprise /api/v1/* endpoints.
 * Keys are passed via Authorization: Bearer <key> or X-API-Key: <key>.
 */

import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/api/_lib/db";

export const API_KEY_PREFIX_LENGTH = 16; // e.g. gs_live_ + 8 hex chars

export type ApiKeyContext = {
  userId: string;
  keyId: string;
  tier: string;
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

/** Generate a new API key value (prefix + secret). Caller hashes and stores. */
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
