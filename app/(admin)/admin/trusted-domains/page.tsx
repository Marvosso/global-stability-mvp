"use client";

import { useCallback, useEffect, useState } from "react";
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

type TrustedDomain = {
  domain: string;
  default_reliability_tier: string;
  is_enabled: boolean;
  notes: string | null;
  created_at: string;
};

type FormState = {
  domain: string;
  default_reliability_tier: string;
  is_enabled: boolean;
  notes: string;
};

const EMPTY_FORM: FormState = {
  domain: "",
  default_reliability_tier: reliability_tier[2] ?? "High",
  is_enabled: true,
  notes: "",
};

export default function TrustedDomainsPage() {
  const { session, isLoading } = useSession();
  const [domains, setDomains] = useState<TrustedDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingDomain, setEditingDomain] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingDomain, setDeletingDomain] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [promoteResult, setPromoteResult] = useState<{ promoted: number; errors?: string[] } | null>(null);

  const fetchDomains = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/internal/trusted-domains", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(text || res.statusText);
      }
      const data = text ? JSON.parse(text) : [];
      setDomains(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load trusted domains"
      );
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (isLoading || !session?.access_token) return;
    fetchDomains();
  }, [isLoading, session?.access_token, fetchDomains]);

  const startCreate = () => {
    setEditingDomain(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
  };

  const startEdit = (td: TrustedDomain) => {
    setEditingDomain(td.domain);
    setForm({
      domain: td.domain,
      default_reliability_tier: td.default_reliability_tier,
      is_enabled: td.is_enabled,
      notes: td.notes ?? "",
    });
    setSaveError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token) return;
    setSaving(true);
    setSaveError(null);
    try {
      const isEditing = editingDomain != null;
      const url = isEditing
        ? `/api/internal/trusted-domains/${encodeURIComponent(editingDomain)}`
        : "/api/internal/trusted-domains";
      const method = isEditing ? "PATCH" : "POST";
      const body: Record<string, unknown> = isEditing
        ? {
            default_reliability_tier: form.default_reliability_tier,
            is_enabled: form.is_enabled,
            notes: form.notes.trim() || null,
          }
        : {
            domain: form.domain.trim(),
            default_reliability_tier: form.default_reliability_tier,
            is_enabled: form.is_enabled,
            notes: form.notes.trim() || null,
          };
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        if (process.env.NODE_ENV === "development") {
          console.error("[TrustedDomains] save failed", {
            status: res.status,
            statusText: res.statusText,
            body: text,
          });
        }
        let msg = text || res.statusText || "Save failed";
        try {
          if (text) {
            const parsed = JSON.parse(text) as { error?: string };
            if (typeof parsed.error === "string") msg = parsed.error;
          }
        } catch {
          // non-JSON, keep msg
        }
        setSaveError(`HTTP ${res.status}: ${msg}`);
        return;
      }
      setEditingDomain(null);
      setForm(EMPTY_FORM);
      await fetchDomains();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save trusted domain"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (domain: string) => {
    if (!session?.access_token) return;
    setDeletingDomain(domain);
    try {
      const res = await fetch(
        `/api/internal/trusted-domains/${encodeURIComponent(domain)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session.access_token}` },
        }
      );
      const text = await res.text();
      if (!res.ok) {
        if (process.env.NODE_ENV === "development") {
          console.error("[TrustedDomains] delete failed", {
            status: res.status,
            statusText: res.statusText,
            body: text,
          });
        }
        return;
      }
      await fetchDomains();
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("[TrustedDomains] delete error", err);
      }
    } finally {
      setDeletingDomain(null);
    }
  };

  const handlePromoteAll = async () => {
    if (!session?.access_token) return;
    setPromoting(true);
    setPromoteResult(null);
    try {
      const res = await fetch("/api/internal/trusted-domains/promote-all", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) {
        setPromoteResult({ promoted: 0, errors: [text || res.statusText || "Request failed"] });
        return;
      }
      setPromoteResult({
        promoted: typeof data.promoted === "number" ? data.promoted : 0,
        errors: Array.isArray(data.errors) ? data.errors : undefined,
      });
    } catch (err) {
      setPromoteResult({
        promoted: 0,
        errors: [err instanceof Error ? err.message : "Request failed"],
      });
    } finally {
      setPromoting(false);
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

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Trusted domains</h2>

      <Card>
        <CardHeader>
          <CardTitle>Trusted domains</CardTitle>
          <CardDescription>
            Domains that are auto-promoted to sources when they appear in
            ingestion.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {domains.length > 0 && (
            <div className="mb-4 flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={promoting}
                onClick={handlePromoteAll}
              >
                {promoting ? "Promoting…" : "Promote all candidates from trusted domains"}
              </Button>
              {promoteResult != null && (
                <span className="text-sm text-muted-foreground">
                  Promoted {promoteResult.promoted} candidate(s).
                  {promoteResult.errors?.length ? ` Errors: ${promoteResult.errors.join("; ")}` : ""}
                </span>
              )}
            </div>
          )}
          {loading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-10 animate-pulse rounded bg-muted"
                  aria-hidden
                />
              ))}
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!loading && !error && domains.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No trusted domains defined yet.
            </p>
          )}
          {!loading && !error && domains.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Default reliability tier</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domains.map((td) => (
                  <TableRow key={td.domain}>
                    <TableCell className="font-mono text-sm">
                      {td.domain}
                    </TableCell>
                    <TableCell>{td.default_reliability_tier}</TableCell>
                    <TableCell>{td.is_enabled ? "Yes" : "No"}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={td.notes ?? undefined}>
                      {td.notes ?? "—"}
                    </TableCell>
                    <TableCell>
                      {new Date(td.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startEdit(td)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={deletingDomain === td.domain}
                        onClick={() => handleDelete(td.domain)}
                      >
                        {deletingDomain === td.domain ? "Deleting…" : "Delete"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {editingDomain ? "Edit trusted domain" : "Add trusted domain"}
          </CardTitle>
          <CardDescription>
            Domains are stored in normalized form (eTLD+1, e.g. usgs.gov).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!editingDomain && domains.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mb-4"
              onClick={startCreate}
            >
              New trusted domain
            </Button>
          )}
          <form
            id="admin_trusted_domains_form"
            className="space-y-4"
            onSubmit={handleSubmit}
          >
            <div className="space-y-2">
              <Label htmlFor="td-domain">Domain</Label>
              <Input
                id="td-domain"
                value={form.domain}
                disabled={!!editingDomain || saving}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, domain: e.target.value }))
                }
                placeholder="usgs.gov"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="td-tier">Default reliability tier</Label>
              <Select
                value={form.default_reliability_tier}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, default_reliability_tier: v }))
                }
                disabled={saving}
              >
                <SelectTrigger id="td-tier">
                  <SelectValue />
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
              <Label htmlFor="td-enabled">Enabled</Label>
              <div className="flex items-center gap-2">
                <input
                  id="td-enabled"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={form.is_enabled}
                  disabled={saving}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      is_enabled: e.target.checked,
                    }))
                  }
                />
                <span className="text-sm text-muted-foreground">
                  Auto-promote when this domain appears in ingestion.
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="td-notes">Notes</Label>
              <textarea
                id="td-notes"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={form.notes}
                disabled={saving}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Optional notes"
                maxLength={2000}
              />
            </div>
            {saveError && (
              <p className="text-sm text-destructive">{saveError}</p>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
              {editingDomain && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    setEditingDomain(null);
                    setForm(EMPTY_FORM);
                    setSaveError(null);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

