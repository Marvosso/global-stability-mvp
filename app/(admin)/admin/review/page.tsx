"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSession } from "@/components/auth/SessionProvider";
import { cn } from "@/lib/utils";

type UnderReviewEvent = {
  id: string;
  title: string | null;
  category: string;
  subtype: string | null;
  severity: string;
  confidence_level: string;
  occurred_at: string | null;
  created_at: string;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function SeverityBadge({ value }: { value: string }) {
  const variant =
    value === "High"
      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
      : value === "Medium"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        variant
      )}
    >
      {value}
    </span>
  );
}

function ConfidenceBadge({ value }: { value: string }) {
  const variant =
    value === "High"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
      : value === "Medium"
        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
        : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        variant
      )}
    >
      {value}
    </span>
  );
}

export default function ReviewPage() {
  const router = useRouter();
  const { session, isLoading } = useSession();
  const [events, setEvents] = useState<UnderReviewEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(() => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    fetch("/api/internal/review/under-review", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (res) => {
        const text = await res.text();
        if (!res.ok) throw new Error(text || res.statusText);
        return text ? JSON.parse(text) : [];
      })
      .then((data: UnderReviewEvent[]) => {
        setEvents(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load events");
      })
      .finally(() => setLoading(false));
  }, [session?.access_token]);

  useEffect(() => {
    if (isLoading || !session?.access_token) return;
    fetchEvents();
  }, [isLoading, session?.access_token, fetchEvents]);

  const handleRowClick = (id: string) => {
    router.push(`/admin/review/${id}`);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Under Review</h2>

      <Card>
        <CardHeader>
          <CardTitle>Events awaiting review</CardTitle>
          <CardDescription>
            Events in UnderReview status. Click a row to open details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-10 animate-pulse rounded bg-muted"
                  aria-hidden
                />
              ))}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {!loading && !error && events.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No events awaiting review.
            </p>
          )}

          {!loading && !error && events.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Subtype</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Occurred</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((ev) => (
                  <TableRow
                    key={ev.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(ev.id)}
                  >
                    <TableCell className="font-medium">
                      {ev.title?.trim() || "—"}
                    </TableCell>
                    <TableCell>{ev.category}</TableCell>
                    <TableCell>{ev.subtype ?? "—"}</TableCell>
                    <TableCell>
                      <SeverityBadge value={ev.severity} />
                    </TableCell>
                    <TableCell>
                      <ConfidenceBadge value={ev.confidence_level} />
                    </TableCell>
                    <TableCell>{formatDate(ev.occurred_at)}</TableCell>
                    <TableCell>{formatDate(ev.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
