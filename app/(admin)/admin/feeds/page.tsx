"use client";

import { useEffect, useState, useCallback } from "react";
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
import { useSession } from "@/components/auth/SessionProvider";

type IngestionRun = {
  id: string;
  feed_key: string;
  started_at: string;
  finished_at: string | null;
  items_fetched: number | null;
  processed: number | null;
  skipped: number | null;
  status: string | null;
  error_message: string | null;
};

const FEEDS = [
  { feed_key: "usgs_eq", label: "USGS Earthquakes" },
  { feed_key: "gdacs_rss", label: "GDACS Disasters" },
  { feed_key: "gdelt", label: "GDELT Events" },
  { feed_key: "crisiswatch", label: "CrisisWatch" },
  { feed_key: "state_dept_advisories", label: "State Dept Advisories" },
  { feed_key: "reliefweb_disasters", label: "ReliefWeb Disasters" },
] as const;

type FeedKey = typeof FEEDS[number]["feed_key"];

type RunState = { status: "idle" | "running" | "success" | "error"; message?: string };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function FeedsPage() {
  const { session, isLoading } = useSession();
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<Record<string, RunState>>({});
  const [runAllState, setRunAllState] = useState<RunState>({ status: "idle" });

  const anyRunning =
    runAllState.status === "running" ||
    Object.values(runStatus).some((s) => s.status === "running");

  const fetchRuns = useCallback(async () => {
    if (!session?.access_token) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/internal/ingestion-runs", {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || res.statusText);
      const data = text ? JSON.parse(text) : [];
      if (!controller.signal.aborted) setRuns(Array.isArray(data) ? data : []);
    } catch (err) {
      if (!controller.signal.aborted)
        setError(err instanceof Error ? err.message : "Failed to load runs");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
    return () => controller.abort();
  }, [session?.access_token]);

  useEffect(() => {
    if (isLoading || !session?.access_token) return;
    fetchRuns();
  }, [isLoading, session?.access_token, fetchRuns]);

  async function runFeed(feedKey: FeedKey) {
    if (!session?.access_token) return;
    setRunStatus((prev) => ({ ...prev, [feedKey]: { status: "running" } }));

    try {
      const res = await fetch("/api/internal/admin/run-feed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ feed_key: feedKey }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setRunStatus((prev) => ({
          ...prev,
          [feedKey]: {
            status: "error",
            message: data.error ?? data.message ?? res.statusText,
          },
        }));
        return;
      }

      const { fetched, processed, skipped } = data;
      setRunStatus((prev) => ({
        ...prev,
        [feedKey]: {
          status: "success",
          message: `Fetched ${fetched}, processed ${processed}, skipped ${skipped}`,
        },
      }));

      await fetchRuns();

      setTimeout(() => {
        setRunStatus((prev) => ({ ...prev, [feedKey]: { status: "idle" } }));
      }, 4000);
    } catch (err) {
      setRunStatus((prev) => ({
        ...prev,
        [feedKey]: {
          status: "error",
          message: err instanceof Error ? err.message : "Request failed",
        },
      }));
    }
  }

  async function runAllFeeds() {
    if (!session?.access_token) return;
    setRunAllState({ status: "running" });

    // Fire all feeds in parallel — each manages its own per-feed status.
    // This avoids a single long-lived server request that can time out on Vercel.
    await Promise.allSettled(FEEDS.map(({ feed_key }) => runFeed(feed_key)));

    setRunAllState({ status: "success", message: "All feeds completed. See individual results below." });
    setTimeout(() => setRunAllState({ status: "idle" }), 5000);
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-muted-foreground">Please log in.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Feeds</h2>

      <Card>
        <CardHeader>
          <CardTitle>Run feeds</CardTitle>
          <CardDescription>
            Trigger ingestion for individual feeds or run all at once. Results appear in the table below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Run All button */}
          <div className="flex flex-col gap-1">
            <Button
              variant="default"
              size="sm"
              onClick={runAllFeeds}
              disabled={anyRunning}
              className="w-fit"
            >
              {runAllState.status === "running" ? "Running all feeds…" : "Run All Feeds"}
            </Button>
            {runAllState.status === "success" && runAllState.message && (
              <p className="text-xs text-green-600 dark:text-green-400 max-w-prose break-words">
                {runAllState.message}
              </p>
            )}
            {runAllState.status === "error" && runAllState.message && (
              <p className="text-xs text-destructive">{runAllState.message}</p>
            )}
          </div>

          <div className="border-t border-border" />

          {/* Per-feed buttons */}
          <div className="flex flex-wrap gap-4">
            {FEEDS.map(({ feed_key, label }) => {
              const status = runStatus[feed_key] ?? { status: "idle" as const };
              return (
                <div key={feed_key} className="flex flex-col gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runFeed(feed_key)}
                    disabled={anyRunning}
                  >
                    {status.status === "running" ? "Running…" : `Run ${label}`}
                  </Button>
                  {status.status === "success" && status.message && (
                    <p className="text-xs text-green-600 dark:text-green-400">{status.message}</p>
                  )}
                  {status.status === "error" && status.message && (
                    <p className="text-xs text-destructive">{status.message}</p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent ingestion runs</CardTitle>
          <CardDescription>
            Last 50 runs. Columns: started_at, finished_at, feed_key, items_fetched, processed, skipped, status, error_message.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading runs…</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Finished</TableHead>
                  <TableHead>Feed</TableHead>
                  <TableHead className="text-right">Fetched</TableHead>
                  <TableHead className="text-right">Processed</TableHead>
                  <TableHead className="text-right">Skipped</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">
                      {formatDate(r.started_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(r.finished_at)}
                    </TableCell>
                    <TableCell className="font-medium">{r.feed_key}</TableCell>
                    <TableCell className="text-right">{r.items_fetched ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.processed ?? "—"}</TableCell>
                    <TableCell className="text-right">{r.skipped ?? "—"}</TableCell>
                    <TableCell>{r.status ?? "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {r.error_message ?? "—"}
                    </TableCell>
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
