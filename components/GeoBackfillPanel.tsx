"use client";

import { useState } from "react";
import { useSession } from "@/components/auth/SessionProvider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * POST /api/backfill-geo with Bearer token (same pattern as Stripe checkout).
 * Shown on /dashboard and /admin so admins do not miss it.
 */
export function GeoBackfillPanel() {
  const { session, user } = useSession();
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [localMessage, setLocalMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const isAdmin =
    String(user?.app_metadata?.role ?? "")
      .trim()
      .toLowerCase() === "admin";

  const handleBackfillGeo = async () => {
    if (!session?.access_token) {
      setLocalMessage({
        type: "error",
        text: "No session token. Try signing out and back in.",
      });
      return;
    }
    setBackfillLoading(true);
    setLocalMessage(null);
    try {
      const res = await fetch("/api/backfill-geo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const data = (await res.json().catch(() => ({}))) as {
        updated?: number;
        scanned?: number;
        error?: string;
      };
      if (!res.ok) {
        const hint =
          res.status === 401
            ? " Set app_metadata.role to \"admin\" in Supabase Auth for this user, then sign out and back in."
            : res.status === 403
              ? " Your account needs Admin role (app_metadata.role = admin)."
              : "";
        setLocalMessage({
          type: "error",
          text: (data?.error ?? `Request failed (${res.status})`) + hint,
        });
        return;
      }
      setLocalMessage({
        type: "success",
        text: `Geo backfill done: updated ${data.updated ?? 0} rows (scanned ${data.scanned ?? 0}).`,
      });
    } catch {
      setLocalMessage({ type: "error", text: "Network error" });
    } finally {
      setBackfillLoading(false);
    }
  };

  return (
    <Card id="geo-backfill" className="mb-8 border-amber-500/30 ring-1 ring-amber-500/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Geo backfill</CardTitle>
        <CardDescription>
          Fills <code className="rounded bg-muted px-1 text-xs">events.lat</code> /{" "}
          <code className="rounded bg-muted px-1 text-xs">lon</code> for published rows missing coordinates.
          API requires <strong>Admin</strong> (
          <code className="rounded bg-muted px-1 text-xs">app_metadata.role</code> ={" "}
          <code className="rounded bg-muted px-1 text-xs">admin</code>).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {localMessage && (
          <p
            className={`mb-3 rounded-md border px-3 py-2 text-sm ${
              localMessage.type === "success"
                ? "border-green-500/40 bg-green-500/10 text-green-900 dark:text-green-200"
                : "border-destructive/40 bg-destructive/10 text-destructive"
            }`}
          >
            {localMessage.text}
          </p>
        )}
        {!isAdmin && (
          <p className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            If the API returns 401, set <code className="rounded bg-muted px-1">app_metadata.role</code> to{" "}
            <code className="rounded bg-muted px-1">admin</code> in Supabase for this user, then sign out and
            back in so the JWT includes the role.
          </p>
        )}
        <Button
          type="button"
          variant="default"
          size="lg"
          className="w-full font-semibold sm:w-auto"
          disabled={backfillLoading || !session?.access_token}
          onClick={handleBackfillGeo}
        >
          {backfillLoading ? (
            <>
              <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Running backfill…
            </>
          ) : (
            "Run geo backfill"
          )}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Location: <code className="rounded bg-muted px-1">/dashboard</code> and{" "}
          <code className="rounded bg-muted px-1">/admin</code> (this panel).
        </p>
      </CardContent>
    </Card>
  );
}
