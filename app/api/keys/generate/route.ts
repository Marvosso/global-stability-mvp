import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import { responseFromThrown, unauthorized, internalError } from "@/lib/apiError";
import { generateApiKeyValue } from "@/lib/apiKey";
import { supabaseAdmin } from "@/app/api/_lib/db";

/**
 * POST /api/keys/generate
 * Creates a new API key for the authenticated user (Supabase session).
 * Key is returned only once; store it securely.
 * New keys start as tier "free" with 500 credits/mo.
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  let userId: string;
  try {
    const ctx = await requireAuth(request);
    userId = ctx.userId;
  } catch (err) {
    const res = responseFromThrown(err);
    if (res) return res;
    return unauthorized();
  }

  const log = createRequestLogger({ requestId });

  const { key, prefix, hash } = generateApiKeyValue();
  const nextMonth = new Date();
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  nextMonth.setUTCDate(1);
  nextMonth.setUTCHours(0, 0, 0, 0);

  const { data: row, error } = await supabaseAdmin
    .from("api_keys")
    .insert({
      user_id: userId,
      key_prefix: prefix,
      key_hash: hash,
      tier: "free",
      credits_remaining: 500,
      credits_reset_at: nextMonth.toISOString(),
    })
    .select("id, key_prefix, tier, credits_remaining, credits_reset_at")
    .single();

  if (error) {
    log.error("API key insert failed", { error: error.message });
    return internalError(error.message);
  }

  log.info("API key created", { keyId: row.id, userId });
  return NextResponse.json({
    key,
    key_id: row.id,
    key_prefix: row.key_prefix,
    tier: row.tier,
    credits_remaining: row.credits_remaining,
    credits_reset_at: row.credits_reset_at,
    message: "Store this key securely; it will not be shown again.",
  });
}
