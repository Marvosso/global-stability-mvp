"use client";

import { useCallback, useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/components/auth/SessionProvider";
import { cn } from "@/lib/utils";
import { event_category, severity_level } from "@/app/api/_lib/enums";

type ReviewQueueEvent = {
  id: string;
  title: string | null;
  category: string;
  subtype: string | null;
  severity: string;
  confidence_level: string;
  occurred_at: string | null;
  primary_location: string | null;
  created_at: string;
};

type QueueResponse = {
  items: ReviewQueueEvent[];
  total: number;
  limit: number;
  offset: number;
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
    value === "Critical"
      ? "bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-200"
      : value === "High"
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

const PAGE_SIZE = 20;

export default function ReviewQueuePage() {
  const router = useRouter();
  const { session, isLoading } = useSession();
  const [events, setEvents] = useState<ReviewQueueEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const fetchQueue = useCallback(() => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(page * PAGE_SIZE));
    if (categoryFilter) params.set("category", categoryFilter);
    if (severityFilter) params.set("severity", severityFilter);
    if (search.trim()) params.set("search", search.trim());
    fetch(`/api/internal/review/queue?${params.toString()}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (res) => {
        const text = await res.text();
        if (!res.ok) throw new Error(text || res.statusText);
        return text ? JSON.parse(text) : { items: [], total: 0, limit: PAGE_SIZE, offset: 0 };
      })
      .then((data: QueueResponse) => {
        setEvents(Array.isArray(data.items) ? data.items : []);
        setTotal(typeof data.total === "number" ? data.total : 0);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load queue");
      })
      .finally(() => setLoading(false));
  }, [session?.access_token, page, categoryFilter, severityFilter, search]);

  useEffect(() => {
    if (isLoading || !session?.access_token) return;
    fetchQueue();
  }, [isLoading, session?.access_token, fetchQueue]);

  const handleFilterChange = (type: "category" | "severity" | "search", value: string) => {
    if (type === "category") setCategoryFilter(value);
    else if (type === "severity") setSeverityFilter(value);
    else setSearch(value);
    setPage(0);
  };

  const handleRowClick = (id: string) => {
    router.push(`/admin/review/${id}`);
  };

  const start = page * PAGE_SIZE;
  const end = Math.min(start + events.length, total);
  const hasNext = (page + 1) * PAGE_SIZE < total;
  const hasPrev = page > 0;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Review queue</h2>

      <Card>
        <CardHeader>
          <CardTitle>Under review events</CardTitle>
          <CardDescription>
            Events in UnderReview status. Use filters and pagination, then click a row to open details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="queue-category" className="text-sm font-medium whitespace-nowrap">
                Category
              </label>
              <Select
                value={categoryFilter || "all"}
                onValueChange={(v) => handleFilterChange("category", v === "all" ? "" : v)}
              >
                <SelectTrigger id="queue-category" className="w-[200px]">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {event_category.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="queue-severity" className="text-sm font-medium whitespace-nowrap">
                Severity
              </label>
              <Select
                value={severityFilter || "all"}
                onValueChange={(v) => handleFilterChange("severity", v === "all" ? "" : v)}
              >
                <SelectTrigger id="queue-severity" className="w-[140px]">
                  <SelectValue placeholder="All severities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severities</SelectItem>
                  {severity_level.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="queue-search" className="text-sm font-medium whitespace-nowrap">
                Search
              </label>
              <Input
                id="queue-search"
                placeholder="Search title or summary"
                value={search}
                onChange={(e) => handleFilterChange("search", e.target.value)}
                className="w-[220px]"
              />
            </div>
          </div>

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
              No events match the current filters.
            </p>
          )}

          {!loading && !error && events.length > 0 && (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Occurred</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Subtype</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Primary location</TableHead>
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
                      <TableCell>{formatDate(ev.occurred_at)}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate" title={ev.title ?? undefined}>
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
                      <TableCell className="max-w-[140px] truncate" title={ev.primary_location ?? undefined}>
                        {ev.primary_location?.trim() || "—"}
                      </TableCell>
                      <TableCell>{formatDate(ev.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between gap-4 pt-2">
                <p className="text-sm text-muted-foreground">
                  Showing {total === 0 ? 0 : start + 1}–{end} of {total}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!hasPrev}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!hasNext}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
