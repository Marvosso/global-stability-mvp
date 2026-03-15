import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAuthUserForMiddleware } from "@/lib/rbac";
import { createRequestLogger } from "@/lib/logger";
import { unauthorized, internalError } from "@/lib/apiError";
import { supabaseAdmin } from "@/app/api/_lib/db";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID ?? "price_placeholder";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function getStripe(): Stripe {
  if (!STRIPE_SECRET_KEY?.startsWith("sk_")) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(STRIPE_SECRET_KEY);
}

/**
 * POST /api/stripe/create-checkout
 * Creates a Stripe Checkout session for Pro tier subscription.
 * Requires Supabase auth (session via cookie or Authorization header).
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = createRequestLogger({ requestId });

  const user = await getSupabaseAuthUserForMiddleware(request);
  // #region agent log
  try {
    await fetch("http://127.0.0.1:7858/ingest/4ea7f127-3afa-4a64-b2bb-235c0c1420f9", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "6a23e5" },
      body: JSON.stringify({
        sessionId: "6a23e5",
        location: "create-checkout/route.ts:POST",
        message: "Auth result before 401",
        data: { userNull: !user, userId: user?.id ?? null, hypothesisId: "H4" },
        timestamp: Date.now(),
      }),
    });
  } catch (_) {}
  // #endregion
  if (!user) {
    return unauthorized();
  }

  const userId = user.id;
  const email = typeof user.email === "string" && user.email.trim() ? user.email.trim() : undefined;

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch {
    log.error("Stripe not configured");
    return internalError("Stripe is not configured");
  }

  try {

    const { data: subRow } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    let customerId: string | null = (subRow as { stripe_customer_id: string | null } | null)?.stripe_customer_id ?? null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email ?? undefined,
        metadata: { supabase_user_id: userId },
      });
      customerId = customer.id;
      const { error: insertErr } = await supabaseAdmin.from("subscriptions").upsert(
        {
          user_id: userId,
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (insertErr) {
        log.warn("Failed to save stripe_customer_id", { userId, error: insertErr.message });
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: PRO_PRICE_ID, quantity: 1 }],
      success_url: `${SITE_URL.replace(/\/$/, "")}/dashboard?success=true`,
      cancel_url: `${SITE_URL.replace(/\/$/, "")}/dashboard?canceled=true`,
      client_reference_id: userId,
      customer: customerId,
    });

    return NextResponse.json({
      sessionId: session.id,
      url: session.url ?? null,
    });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      log.error("Stripe error", { code: err.code, message: err.message });
      return internalError(err.message ?? "Stripe error");
    }
    log.error("Create checkout error", { err });
    return internalError("Failed to create checkout session");
  }
}
