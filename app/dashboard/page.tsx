"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/components/auth/SessionProvider";
import { supabaseBrowserClient } from "@/lib/supabaseBrowserClient";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GeoBackfillPanel } from "@/components/GeoBackfillPanel";

type ApiKeyRow = {
  tier: string | null;
  credits_remaining: number | null;
  credits_reset_at: string | null;
};

type SubscriptionRow = {
  status: string | null;
  current_period_end: string | null;
};

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, user, isLoading: sessionLoading } = useSession();

  const [apiKeyRow, setApiKeyRow] = useState<ApiKeyRow | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "canceled" | "error"; text: string } | null>(null);

  const fetchPlan = useCallback(async (userId: string) => {
    setPlanLoading(true);
    try {
      const [keysRes, subRes] = await Promise.all([
        supabaseBrowserClient
          .from("api_keys")
          .select("tier, credits_remaining, credits_reset_at")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle(),
        supabaseBrowserClient
          .from("subscriptions")
          .select("status, current_period_end")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      setApiKeyRow((keysRes.data as ApiKeyRow | null) ?? null);
      setSubscription((subRes.data as SubscriptionRow | null) ?? null);
    } catch {
      setApiKeyRow(null);
      setSubscription(null);
    } finally {
      setPlanLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      router.replace("/login?redirect=/dashboard");
      return;
    }
    fetchPlan(user.id);
  }, [user, sessionLoading, router, fetchPlan]);

  useEffect(() => {
    const success = searchParams.get("success");
    const canceled = searchParams.get("canceled");
    if (success === "true") {
      setMessage({ type: "success", text: "Upgrade successful! Your Pro tier is active." });
      if (user?.id) fetchPlan(user.id);
      window.history.replaceState({}, "", "/dashboard");
    } else if (canceled === "true") {
      setMessage({ type: "canceled", text: "Upgrade canceled – no changes made." });
      window.history.replaceState({}, "", "/dashboard");
    }
  }, [searchParams, user?.id, fetchPlan]);

  useEffect(() => {
    if (!user) return;
    const channel = supabaseBrowserClient
      .channel("api_keys_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "api_keys",
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchPlan(user.id)
      )
      .subscribe();
    return () => {
      supabaseBrowserClient.removeChannel(channel);
    };
  }, [user?.id, fetchPlan]);

  const handleUpgrade = async () => {
    if (!user) return;
    setUpgradeLoading(true);
    setMessage(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers,
        credentials: "include",
      });
      let data: { error?: string; url?: string; sessionId?: string };
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok) {
        const msg = data?.error ?? (res.status === 400 ? "Checkout failed. Ensure Stripe key and price ID use the same mode (test or live)." : "Failed to start checkout");
        setMessage({ type: "error", text: msg });
        setUpgradeLoading(false);
        return;
      }
      const url = data.url ?? (data.sessionId ? `https://checkout.stripe.com/c/pay/${data.sessionId}` : null);
      if (url) {
        window.location.href = url;
        return;
      }
      setMessage({ type: "error", text: "No checkout URL returned" });
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setUpgradeLoading(false);
    }
  };

  if (sessionLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const tier = apiKeyRow?.tier ?? "free";
  const isPro = tier === "pro" || subscription?.status === "active";
  const creditsRemaining = apiKeyRow?.credits_remaining ?? 500;
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-semibold">GeoStability Dashboard</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/">API</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin">Admin</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {message && (
          <Card
            className={`mb-6 ${
              message.type === "success"
                ? "border-green-500/50 bg-green-500/10"
                : message.type === "canceled"
                  ? "border-muted"
                  : "border-destructive/50 bg-destructive/10"
            }`}
          >
            <CardContent className="flex items-center justify-between py-4">
              <p
                className={
                  message.type === "success"
                    ? "text-green-700 dark:text-green-400"
                    : message.type === "error"
                      ? "text-destructive"
                      : "text-muted-foreground"
                }
              >
                {message.text}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMessage(null)}
                aria-label="Dismiss"
              >
                ×
              </Button>
            </CardContent>
          </Card>
        )}

        <GeoBackfillPanel />

        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold">Your Plan</h2>
          {planLoading ? (
            <Card>
              <CardContent className="py-8">
                <div className="h-6 w-48 animate-pulse rounded bg-muted" />
                <div className="mt-2 h-4 w-32 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Current tier: {isPro ? "Pro" : "Free"}
                </CardTitle>
                {isPro && periodEnd && (
                  <CardDescription>
                    Active until {periodEnd}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {isPro
                    ? "API calls this month: Unlimited"
                    : `API calls this month: ${creditsRemaining} / 500`}
                </p>
              </CardContent>
            </Card>
          )}
        </section>

        {!planLoading && (
          <section className="mb-8">
            {isPro ? (
              <Card>
                <CardContent className="py-6">
                  <p className="text-sm text-muted-foreground">
                    You’re on Pro. Manage billing in Stripe (portal link can be added here).
                  </p>
                  <Button variant="outline" size="sm" className="mt-3" disabled>
                    Manage Subscription (coming soon)
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-primary/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Upgrade to Pro</CardTitle>
                  <CardDescription>
                    Get unlimited API calls and premium params like full_summary.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={handleUpgrade}
                    disabled={upgradeLoading}
                    className="w-full sm:w-auto"
                  >
                    {upgradeLoading ? (
                      <>
                        <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Redirecting…
                      </>
                    ) : (
                      "Upgrade to Pro – $9/month"
                    )}
                  </Button>
                  <p className="mt-2 text-xs text-muted-foreground">
                    You’ll be redirected to Stripe Checkout. Cancel anytime.
                  </p>
                </CardContent>
              </Card>
            )}
          </section>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quick links</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/#quick-start">API docs</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin">Admin</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/login">Account</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function DashboardFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardContent />
    </Suspense>
  );
}
