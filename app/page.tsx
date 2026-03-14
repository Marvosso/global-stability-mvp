"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { CategoryBadge } from "@/components/ui/category-badge";

type PublicEvent = {
  id: string;
  title: string;
  summary: string;
  details?: string | null;
  category: string;
  subtype?: string | null;
  primary_classification?: string;
  secondary_classification?: string | null;
  severity: string;
  confidence_level?: string;
  occurred_at?: string | null;
  ended_at?: string | null;
  primary_location?: string | null;
  created_at: string;
  updated_at?: string;
};

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function HomePage() {
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/public/events?limit=20&offset=0")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load events");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        list.sort((a, b) => {
          const ta = a.occurred_at || a.created_at ? new Date(a.occurred_at || a.created_at).getTime() : 0;
          const tb = b.occurred_at || b.created_at ? new Date(b.occurred_at || b.created_at).getTime() : 0;
          return tb - ta;
        });
        setEvents(list);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load events");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-semibold">GeoStability</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/methodology">Methodology</Link>
            </Button>
            <Button variant="default" size="sm" asChild>
              <Link href="/map">Open global map</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin">Admin</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <h2 className="mb-6 text-lg font-medium text-muted-foreground">
          Published events
          {!loading && !error && (
            <span className="ml-2 font-normal text-muted-foreground">
              ({events.length})
            </span>
          )}
        </h2>

        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="h-6 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {error && (
          <Card className="border-destructive/50">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {!loading && !error && events.length === 0 && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                No published events.
              </p>
            </CardContent>
          </Card>
        )}

        {!loading && !error && events.length > 0 && (
          <ul className="space-y-4">
            {events.map((ev) => (
              <li key={ev.id}>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      {ev.title?.trim() || "Untitled"}
                    </CardTitle>
                    <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <CategoryBadge category={ev.category} />
                      {ev.subtype && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{ev.subtype}</span>
                        </>
                      )}
                      <span aria-hidden>·</span>
                      <span>{ev.severity}</span>
                      <span aria-hidden>·</span>
                      <ConfidenceBadge level={ev.confidence_level} />
                      <span aria-hidden>·</span>
                      <span>
                        {ev.occurred_at
                          ? formatDate(ev.occurred_at)
                          : formatDate(ev.created_at)}
                      </span>
                      {ev.primary_location && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{ev.primary_location}</span>
                        </>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {ev.summary?.trim() || "—"}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}

        <footer className="mt-12 border-t border-border pt-6 text-center text-xs text-muted-foreground">
          <Link href="/methodology" className="underline hover:text-foreground">Methodology</Link>
          {" · "}
          Confidence based on source reliability and corroboration count.
        </footer>
      </main>
    </div>
  );
}
