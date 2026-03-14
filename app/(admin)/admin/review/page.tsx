"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/components/auth/SessionProvider";
import { cn } from "@/lib/utils";

const TRUSTED_FEED_KEYS = ["usgs_eq", "usgs", "gdacs_rss", "gdacs"];

type DashboardItem = {
  id: string;
  feed_key: string | null;
  title: string | null;
  source_url: string | null;
  occurred_at: string | null;
  location: string | null;
  summary: string | null;
  category: string;
  subtype: string | null;
  severity: string;
  confidence_level: string;
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

function truncate(s: string | null, max: number): string {
  if (!s) return "—";
  return s.length <= max ? s : s.slice(0, max) + "…";
}

export default function ReviewPage() {
  const router = useRouter();
  const { session, isLoading } = useSession();
  const [items, setItems] = useState<DashboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [bulkApproving, setBulkApproving] = useState(false);

  const fetchItems = useCallback(() => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    fetch("/api/internal/review/dashboard", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (res) => {
        const text = await res.text();
        if (!res.ok) throw new Error(text || res.statusText);
        return text ? JSON.parse(text) : [];
      })
      .then((data: DashboardItem[]) => {
        setItems(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load review queue");
      })
      .finally(() => setLoading(false));
  }, [session?.access_token]);

  useEffect(() => {
    if (isLoading || !session?.access_token) return;
    fetchItems();
  }, [isLoading, session?.access_token, fetchItems]);

  const handleApprove = (id: string) => {
    if (!session?.access_token) return;
    setActingId(id);
    fetch(`/api/internal/review/${id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => {
        if (!res.ok) return res.text().then((t) => Promise.reject(new Error(t)));
        fetchItems();
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Approve failed"))
      .finally(() => setActingId(null));
  };

  const handleReject = (id: string) => {
    if (!session?.access_token) return;
    setActingId(id);
    fetch(`/api/internal/review/${id}/reject`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => {
        if (!res.ok) return res.text().then((t) => Promise.reject(new Error(t)));
        fetchItems();
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Reject failed"))
      .finally(() => setActingId(null));
  };

  const handleBulkApprove = (feedKey: string) => {
    if (!session?.access_token) return;
    setBulkApproving(true);
    fetch("/api/internal/review/bulk-approve", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ feed_key: feedKey }),
    })
      .then((res) => {
        if (!res.ok) return res.json().then((b) => Promise.reject(new Error((b as { error?: string }).error ?? res.statusText)));
        return res.json();
      })
      .then((body: { approved?: number }) => {
        if (typeof body.approved === "number" && body.approved > 0) fetchItems();
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Bulk approve failed"))
      .finally(() => setBulkApproving(false));
  };

  const trustedFeedsWithCount = TRUSTED_FEED_KEYS.map((key) => ({
    key,
    count: items.filter((i) => (i.feed_key ?? "").toLowerCase() === key.toLowerCase()).length,
  })).filter((f) => f.count > 0);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Review dashboard</h2>

      <Card>
        <CardHeader>
          <CardTitle>Under review</CardTitle>
          <CardDescription>
            Draft events from ingestion (status UnderReview). Approve to publish; Reject to archive; Edit to open details.
          </CardDescription>
          {trustedFeedsWithCount.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="text-sm text-muted-foreground">Bulk approve trusted feeds:</span>
              {trustedFeedsWithCount.map(({ key, count }) => (
                <Button
                  key={key}
                  variant="outline"
                  size="sm"
                  disabled={bulkApproving}
                  onClick={() => handleBulkApprove(key)}
                >
                  {key} ({count})
                </Button>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" aria-hidden />
              ))}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive mb-4">{error}</p>
          )}

          {!loading && !error && items.length === 0 && (
            <p className="text-sm text-muted-foreground">No events under review.</p>
          )}

          {!loading && !error && items.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feed</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Source URL</TableHead>
                    <TableHead>Occurred</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">
                        {row.feed_key ?? "—"}
                      </TableCell>
                      <TableCell className="font-medium max-w-[200px]">
                        <span title={row.title ?? undefined}>
                          {truncate(row.title, 60)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[180px]">
                        {row.source_url ? (
                          <a
                            href={row.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary underline truncate block"
                          >
                            {truncate(row.source_url, 40)}
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                        {formatDate(row.occurred_at)}
                      </TableCell>
                      <TableCell className="text-xs max-w-[120px]" title={row.location ?? undefined}>
                        {truncate(row.location, 20)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs max-w-[220px]" title={row.summary ?? undefined}>
                        {truncate(row.summary, 80)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="default"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={actingId === row.id}
                            onClick={() => handleApprove(row.id)}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={actingId === row.id}
                            onClick={() => handleReject(row.id)}
                          >
                            Reject
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            asChild
                          >
                            <Link href={`/admin/review/${row.id}`}>Edit</Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
