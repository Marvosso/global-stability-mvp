"use client";

import { useEffect, useState } from "react";
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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function IngestionRunsPage() {
  const { session, isLoading } = useSession();
  const [runs, setRuns] = useState<IngestionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !session?.access_token) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch("/api/internal/ingestion-runs", {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (res) => {
        const text = await res.text();
        if (!res.ok) throw new Error(text || res.statusText);
        return text ? JSON.parse(text) : [];
      })
      .then((data) => {
        if (!controller.signal.aborted) setRuns(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(err instanceof Error ? err.message : "Failed to load runs");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [isLoading, session?.access_token]);

  const lastRun = runs[0] ?? null;
  const lastErrorRun = runs.find((r) => r.error_message) ?? null;

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
      <h2 className="text-xl font-semibold">Ingestion Runs</h2>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Last run
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {lastRun ? formatDate(lastRun.started_at) : "—"}
            </p>
            {lastRun?.feed_key && (
              <p className="text-xs text-muted-foreground">Feed: {lastRun.feed_key}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Processed (last run)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {lastRun?.processed != null ? lastRun.processed : "—"}
            </p>
            {lastRun?.skipped != null && (
              <p className="text-xs text-muted-foreground">Skipped: {lastRun.skipped}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Last error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium break-words">
              {lastErrorRun?.error_message ?? "—"}
            </p>
            {lastErrorRun && (
              <p className="text-xs text-muted-foreground mt-1">
                {formatDate(lastErrorRun.started_at)} ({lastErrorRun.feed_key})
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
          <CardDescription>
            Last 50 ingestion runs. Runs are recorded when a batch is sent to the ingest API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feed</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Finished</TableHead>
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
                    <TableCell className="font-medium">{r.feed_key}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(r.started_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(r.finished_at)}
                    </TableCell>
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
