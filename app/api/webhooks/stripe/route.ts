import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createRequestLogger } from "@/lib/logger";
import { supabaseAdmin } from "@/app/api/_lib/db";

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
/**
 * POST /api/webhooks/stripe
 * Stripe webhook handler. Uses raw body for signature verification.
 * Next.js App Router: read body via request.arrayBuffer() (no bodyParser config).
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const log = createRequestLogger({ requestId });

  if (!STRIPE_WEBHOOK_SECRET?.startsWith("whsec_")) {
    log.error("STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let body: Buffer;
  try {
    const arrayBuffer = await request.arrayBuffer();
    body = Buffer.from(arrayBuffer);
  } catch (err) {
    log.error("Failed to read webhook body", { err });
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signature verification failed";
    log.warn("Stripe webhook signature verification failed", { message });
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
        const status = subscription.status ?? null;
        const currentPeriodEnd = subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null;

        let userId: string | null = subscription.metadata?.supabase_user_id ?? null;
        if (!userId && customerId) {
          const { data: row } = await supabaseAdmin
            .from("subscriptions")
            .select("user_id")
            .eq("stripe_customer_id", customerId)
            .maybeSingle();
          userId = (row as { user_id: string } | null)?.user_id ?? null;
        }

        if (userId) {
          await supabaseAdmin.from("subscriptions").upsert(
            {
              user_id: userId,
              stripe_customer_id: customerId ?? undefined,
              stripe_subscription_id: subscription.id,
              status,
              current_period_end: currentPeriodEnd,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );

          if (status === "active") {
            const { error: keysErr } = await supabaseAdmin
              .from("api_keys")
              .update({
                tier: "pro",
                credits_remaining: 999999,
                credits_reset_at: null,
              })
              .eq("user_id", userId);
            if (keysErr) {
              log.warn("Failed to update api_keys to pro", { userId, error: keysErr.message });
            }
          }
        } else {
          log.warn("Subscription event missing user id", { subscriptionId: subscription.id });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
        let userId: string | null = subscription.metadata?.supabase_user_id ?? null;
        if (!userId && customerId) {
          const { data: row } = await supabaseAdmin
            .from("subscriptions")
            .select("user_id")
            .eq("stripe_customer_id", customerId)
            .maybeSingle();
          userId = (row as { user_id: string } | null)?.user_id ?? null;
        }

        if (userId) {
          await supabaseAdmin
            .from("subscriptions")
            .update({
              stripe_subscription_id: null,
              status: "canceled",
              current_period_end: null,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);

          const nextMonth = new Date();
          nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
          nextMonth.setUTCDate(1);
          nextMonth.setUTCHours(0, 0, 0, 0);
          const { error: keysErr } = await supabaseAdmin
            .from("api_keys")
            .update({
              tier: "free",
              credits_remaining: 500,
              credits_reset_at: nextMonth.toISOString(),
            })
            .eq("user_id", userId);
          if (keysErr) {
            log.warn("Failed to update api_keys to free", { userId, error: keysErr.message });
          }
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        log.info("Stripe invoice.payment_succeeded", {
          invoiceId: invoice.id,
          customerId: invoice.customer,
          amountPaid: invoice.amount_paid,
        });
        break;
      }

      default:
        log.info("Unhandled Stripe event type", { type: event.type });
    }
  } catch (err) {
    log.error("Stripe webhook processing error", { type: event.type, err });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
