"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { reliability_tier } from "@/app/api/_lib/enums";
import { useSession } from "@/components/auth/SessionProvider";

type SourceCandidate = {
  id: string;
  url: string;
  domain: string;
  name_guess?: string | null;
  suggested_reliability_tier?: string | null;
  suggested_ecosystem?: string | null;
  evidence_excerpt?: string | null;
  discovered_from_event_id?: string | null;
  status: string;
  created_at?: string;
};

type ApproveForm = {
  name: string;
  reliability_tier: string;
  ecosystem_key: string;
  notes: string;
};

const DEFAULT_APPROVE_FORM: ApproveForm = {
  name: "",
  reliability_tier: "",
  ecosystem_key: "",
  notes: "",
};

/** True when candidate represents a whole domain (eTLD+1), not a single article URL. */
function isDomainLevelCandidate(c: SourceCandidate): boolean {
  return c.domain !== "" && c.url === `https://${c.domain}`;
}

export default function SourceCandidatesPage() {
  const { session, isLoading } = useSession();
  const [candidates, setCandidates] = useState<SourceCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveForm, setApproveForm] = useState<ApproveForm>(DEFAULT_APPROVE_FORM);
  const [approveLoading, setApproveLoading] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectLoading, setRejectLoading] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const approveFormRef = useRef<HTMLDivElement>(null);
  const rejectFormRef = useRef<HTMLDivElement>(null);

  const fetchCandidates = useCallback(() => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    fetch("/api/internal/source-candidates?status=Pending", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (res) => {
        const text = await res.text();
        if (!res.ok) {
          throw new Error(`Failed to load candidates: HTTP ${res.status} - ${text || res.statusText}`);
        }
        return text ? JSON.parse(text) : [];
      })
      .then((list) => {
        setCandidates(Array.isArray(list) ? list : list?.data ?? []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load candidates");
      })
      .finally(() => setLoading(false));
  }, [session?.access_token]);

  useEffect(() => {
    if (isLoading || !session?.access_token) return;
    fetchCandidates();
  }, [isLoading, session?.access_token, fetchCandidates]);

  useEffect(() => {
    if (approvingId) {
      approveFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [approvingId]);

  useEffect(() => {
    if (rejectingId) {
      rejectFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [rejectingId]);

  const openApprove = (c: SourceCandidate) => {
    setApprovingId(c.id);
    setApproveForm({
      name: c.name_guess?.trim() || c.domain || c.url || "",
      reliability_tier: c.suggested_reliability_tier ?? "",
      ecosystem_key: c.suggested_ecosystem ?? "",
      notes: "",
    });
    setApproveError(null);
  };

  const closeApprove = () => {
    setApprovingId(null);
    setApproveForm(DEFAULT_APPROVE_FORM);
    setApproveError(null);
  };

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (process.env.NODE_ENV === "development") {
      console.log("[SourceCandidates] handleApprove called", {
        approvingId,
        hasToken: !!session?.access_token,
      });
    }
    if (!approvingId || !session?.access_token) return;
    const name = approveForm.name.trim();
    if (!name) {
      setApproveError("Name is required.");
      return;
    }
    setApproveError(null);
    setApproveLoading(true);
    try {
      const body: Record<string, unknown> = { name };
      if (approveForm.reliability_tier) body.reliability_tier = approveForm.reliability_tier;
      if (approveForm.ecosystem_key.trim()) body.ecosystem_key = approveForm.ecosystem_key.trim();
      if (approveForm.notes.trim()) body.notes = approveForm.notes.trim();
      if (process.env.NODE_ENV === "development") {
        console.log("[SourceCandidates] Sending approve request", { id: approvingId });
      }
      const res = await fetch(`/api/internal/source-candidates/${approvingId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: Record<string, unknown> = {};
      try {
        if (text) data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        /* non-JSON */
      }
      if (!res.ok) {
        if (process.env.NODE_ENV === "development") {
          console.error("[SourceCandidates] Approve failed", {
            status: res.status,
            statusText: res.statusText,
            body: text,
          });
        }
        const msg =
          typeof data?.error === "string"
            ? data.error
            : text?.trim() || res.statusText || "Failed to approve.";
        setApproveError(`HTTP ${res.status}: ${msg}`);
        return;
      }
      closeApprove();
      setCandidates((prev) => prev.filter((c) => c.id !== approvingId));
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("[SourceCandidates] Approve error", err);
      }
      setApproveError(err instanceof Error ? err.message : "Failed to approve.");
    } finally {
      setApproveLoading(false);
    }
  };

  const openReject = (id: string) => {
    setRejectingId(id);
    setRejectReason("");
    setRejectError(null);
  };

  const closeReject = () => {
    setRejectingId(null);
    setRejectReason("");
    setRejectError(null);
  };

  const handleReject = async () => {
    if (!rejectingId || !session?.access_token) return;
    setRejectError(null);
    setRejectLoading(true);
    try {
      const body = rejectReason.trim() ? { reason: rejectReason.trim() } : {};
      const res = await fetch(`/api/internal/source-candidates/${rejectingId}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: Record<string, unknown> = {};
      try {
        if (text) data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        /* non-JSON */
      }
      if (!res.ok) {
        if (process.env.NODE_ENV === "development") {
          console.error("[SourceCandidates] Reject failed", {
            status: res.status,
            statusText: res.statusText,
            body: text,
          });
        }
        const msg =
          typeof data?.error === "string"
            ? data.error
            : text?.trim() || res.statusText || "Failed to reject.";
        setRejectError(`HTTP ${res.status}: ${msg}`);
        return;
      }
      closeReject();
      setCandidates((prev) => prev.filter((c) => c.id !== rejectingId));
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("[SourceCandidates] Reject error", err);
      }
      setRejectError(err instanceof Error ? err.message : "Failed to reject.");
    } finally {
      setRejectLoading(false);
    }
  };

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

  const approvingCandidate = approvingId
    ? candidates.find((c) => c.id === approvingId)
    : null;
  const rejectingCandidate = rejectingId
    ? candidates.find((c) => c.id === rejectingId)
    : null;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Source candidates</h2>

      <Card>
        <CardHeader>
          <CardTitle>Pending candidates</CardTitle>
          <CardDescription>
            Review and approve or reject discovered sources. On approve, set final name, tier, and ecosystem before promoting to sources.
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
          {!loading && !error && candidates.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No pending candidates. They are created when drafts include a source_url that is not yet in sources.
            </p>
          )}
          {!loading && !error && candidates.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Name guess</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Ecosystem</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead>From event</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((c) => {
                  const domainLevel = isDomainLevelCandidate(c);
                  return (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-[180px] truncate text-muted-foreground" title={c.url}>
                      {domainLevel ? (
                        <span className="flex items-center gap-1.5">
                          <span className="inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium">Domain</span>
                          <span>Domain: {c.domain}</span>
                        </span>
                      ) : (
                        c.url
                      )}
                    </TableCell>
                    <TableCell>{c.domain}</TableCell>
                    <TableCell className="font-medium">{c.name_guess ?? "—"}</TableCell>
                    <TableCell>{c.suggested_reliability_tier ?? "—"}</TableCell>
                    <TableCell>{c.suggested_ecosystem ?? "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground" title={c.evidence_excerpt ?? undefined}>
                      {c.evidence_excerpt ?? "—"}
                    </TableCell>
                    <TableCell>{c.discovered_from_event_id ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="default"
                        size="sm"
                        className="mr-2"
                        onClick={() => openApprove(c)}
                        disabled={approvingId === c.id || rejectingId === c.id}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openReject(c.id)}
                        disabled={approvingId === c.id || rejectingId === c.id}
                      >
                        Reject
                      </Button>
                    </TableCell>
                  </TableRow>
                );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {approvingCandidate && (
        <Card ref={approveFormRef}>
          <CardHeader>
            <CardTitle>Approve: {approvingCandidate.domain}</CardTitle>
            <CardDescription>
              Fill in the form below and click &quot;Promote to sources&quot; to approve. Set final name, reliability tier, and ecosystem key.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleApprove} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="approve-name">Name *</Label>
                <Input
                  id="approve-name"
                  value={approveForm.name}
                  onChange={(e) =>
                    setApproveForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Final source name"
                  disabled={approveLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="approve-tier">Reliability tier</Label>
                <Select
                  value={approveForm.reliability_tier || undefined}
                  onValueChange={(v) =>
                    setApproveForm((prev) => ({ ...prev, reliability_tier: v }))
                  }
                  disabled={approveLoading}
                >
                  <SelectTrigger id="approve-tier">
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    {reliability_tier.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="approve-ecosystem">Ecosystem key</Label>
                <Input
                  id="approve-ecosystem"
                  value={approveForm.ecosystem_key}
                  onChange={(e) =>
                    setApproveForm((prev) => ({ ...prev, ecosystem_key: e.target.value }))
                  }
                  placeholder="Optional"
                  disabled={approveLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="approve-notes">Notes</Label>
                <Input
                  id="approve-notes"
                  value={approveForm.notes}
                  onChange={(e) =>
                    setApproveForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="Optional"
                  disabled={approveLoading}
                />
              </div>
              {approveError && (
                <p className="text-sm text-destructive">{approveError}</p>
              )}
              <div className="flex gap-2">
                <Button type="submit" disabled={approveLoading}>
                  {approveLoading ? "Promoting…" : "Promote to sources"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeApprove}
                  disabled={approveLoading}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {rejectingCandidate && (
        <Card ref={rejectFormRef}>
          <CardHeader>
            <CardTitle>Reject: {rejectingCandidate.domain}</CardTitle>
            <CardDescription>
              Optionally add a reason; the candidate will be marked Rejected.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reject-reason">Reason (optional)</Label>
                <Input
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Optional reason"
                  disabled={rejectLoading}
                />
              </div>
              {rejectError && (
                <p className="text-sm text-destructive">{rejectError}</p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={rejectLoading}
                >
                  {rejectLoading ? "Rejecting…" : "Reject candidate"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeReject}
                  disabled={rejectLoading}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
