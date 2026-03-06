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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { source_type, reliability_tier } from "@/app/api/_lib/enums";
import { useSession } from "@/components/auth/SessionProvider";

type Source = {
  id: string;
  name: string;
  source_type: string;
  url?: string | null;
  domain?: string | null;
  ecosystem_key?: string | null;
  reliability_tier?: string | null;
  created_at?: string;
};

type SourceForm = {
  name: string;
  source_type: string;
  url: string;
  ecosystem_key: string;
  reliability_tier: string;
};

const INITIAL_FORM: SourceForm = {
  name: "",
  source_type: "",
  url: "",
  ecosystem_key: "",
  reliability_tier: "",
};

export default function SourcesPage() {
  const { session, isLoading } = useSession();
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<SourceForm>(INITIAL_FORM);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [editForm, setEditForm] = useState<SourceForm>(INITIAL_FORM);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  const fetchSources = useCallback(() => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    fetch("/api/internal/sources", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (res) => {
        const text = await res.text();
        if (!res.ok) {
          throw new Error(
            `Failed to load sources: HTTP ${res.status} - ${text || res.statusText}`
          );
        }
        return text ? JSON.parse(text) : [];
      })
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.data ?? [];
        setSources(list);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load sources");
      })
      .finally(() => setLoading(false));
  }, [session?.access_token]);

  useEffect(() => {
    if (isLoading || !session?.access_token) return;
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch("/api/internal/sources", {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (res) => {
        const text = await res.text();
        if (!res.ok) {
          throw new Error(
            `Failed to load sources: HTTP ${res.status} - ${text || res.statusText}`
          );
        }
        return text ? JSON.parse(text) : [];
      })
      .then((data) => {
        if (cancelled || controller.signal.aborted) return;
        const list = Array.isArray(data) ? data : data?.data ?? [];
        setSources(list);
      })
      .catch((err) => {
        if (cancelled || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load sources");
      })
      .finally(() => {
        if (!cancelled && !controller.signal.aborted) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isLoading, session?.access_token]);

  const openEdit = (source: Source) => {
    setEditingSource(source);
    setEditForm({
      name: source.name,
      source_type: source.source_type,
      url: source.url ?? "",
      ecosystem_key: source.ecosystem_key ?? "",
      reliability_tier: source.reliability_tier ?? "",
    });
    setEditError(null);
  };

  const closeEdit = () => {
    setEditingSource(null);
    setEditForm(INITIAL_FORM);
    setEditError(null);
  };

  const updateEditForm = (field: keyof SourceForm, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
    setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSource || !session?.access_token) return;
    const name = editForm.name.trim();
    if (!name) {
      setEditError("Name is required.");
      return;
    }
    if (!editForm.source_type) {
      setEditError("Source type is required.");
      return;
    }
    const url = editForm.url.trim();
    if (url) {
      try {
        new URL(url);
      } catch {
        setEditError("URL must be a valid URL.");
        return;
      }
    }
    setEditError(null);
    setEditLoading(true);
    try {
      const body: Record<string, unknown> = {
        name,
        source_type: editForm.source_type,
      };
      if (url) body.url = url;
      else body.url = null;
      if (editForm.ecosystem_key.trim()) body.ecosystem_key = editForm.ecosystem_key.trim();
      else body.ecosystem_key = null;
      if (editForm.reliability_tier) body.reliability_tier = editForm.reliability_tier;
      else body.reliability_tier = null;

      const res = await fetch(`/api/internal/sources/${editingSource.id}`, {
        method: "PATCH",
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
        const msg =
          typeof data?.error === "string" ? data.error : "Failed to update source.";
        setEditError(`HTTP ${res.status} - ${msg}`);
        return;
      }
      closeEdit();
      fetchSources();
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : "Failed to update source."
      );
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async (source: Source) => {
    if (
      !session?.access_token ||
      !window.confirm(`Delete source "${source.name}"? This will fail if it is linked to any events.`)
    )
      return;
    setDeleteLoading(source.id);
    try {
      const res = await fetch(`/api/internal/sources/${source.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        fetchSources();
        if (editingSource?.id === source.id) closeEdit();
      } else {
        const text = await res.text();
        let data: Record<string, unknown> = {};
        try {
          if (text) data = JSON.parse(text) as Record<string, unknown>;
        } catch {
          /* non-JSON */
        }
        const msg =
          typeof data?.error === "string"
            ? data.error
            : `Delete failed (${res.status})`;
        setError(msg);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete source.");
    } finally {
      setDeleteLoading(null);
    }
  };

  const update = (field: keyof SourceForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSubmitError(null);
    setSubmitSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !session.access_token) return;
    const name = form.name.trim();
    if (!name) {
      setSubmitError("Name is required.");
      return;
    }
    if (!form.source_type) {
      setSubmitError("Source type is required.");
      return;
    }
    const url = form.url.trim();
    if (url) {
      try {
        new URL(url);
      } catch {
        setSubmitError("URL must be a valid URL.");
        return;
      }
    }
    setSubmitError(null);
    setSubmitLoading(true);
    try {
      const body: Record<string, unknown> = {
        name,
        source_type: form.source_type,
      };
      if (url) body.url = url;
      if (form.ecosystem_key.trim())
        body.ecosystem_key = form.ecosystem_key.trim();
      if (form.reliability_tier) body.reliability_tier = form.reliability_tier;
      const res = await fetch("/api/internal/sources", {
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
        const msg =
          typeof data?.error === "string" ? data.error : "Failed to create source.";
        setSubmitError(`HTTP ${res.status} - ${msg}${text && !data?.error ? ` | ${text}` : ""}`);
        return;
      }
      setForm(INITIAL_FORM);
      setSubmitSuccess(true);
      if (data?.id) {
        setSources((prev) => [
          {
            id: data.id as string,
            name: (data.name as string) ?? name,
            source_type: (data.source_type as string) ?? form.source_type,
            url: (data.url as string | null) ?? (url || null),
            domain: (data.domain as string | null) ?? null,
            ecosystem_key: (data.ecosystem_key as string | null) ?? (form.ecosystem_key.trim() || null),
            reliability_tier: (data.reliability_tier as string | null) ?? (form.reliability_tier || null),
            created_at: data.created_at as string | undefined,
          },
          ...prev,
        ]);
      } else {
        fetchSources();
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to create source."
      );
    } finally {
      setSubmitLoading(false);
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
      <h2 className="text-xl font-semibold">Sources</h2>

      <Card>
        <CardHeader>
          <CardTitle>All sources</CardTitle>
          <CardDescription>
            Sources that can be linked to events. Create one below.
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
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!loading && !error && sources.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No sources yet. Create one below.
            </p>
          )}
          {!loading && !error && sources.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.source_type}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {s.url ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.domain ?? "—"}
                    </TableCell>
                    <TableCell>{s.reliability_tier ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(s)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(s)}
                          disabled={deleteLoading === s.id}
                        >
                          {deleteLoading === s.id ? "Deleting…" : "Delete"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingSource} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit source</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-source-name">Name *</Label>
              <Input
                id="edit-source-name"
                value={editForm.name}
                onChange={(e) => updateEditForm("name", e.target.value)}
                placeholder="e.g. Reuters"
                disabled={editLoading}
                maxLength={500}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-source-type">Source type *</Label>
              <Select
                value={editForm.source_type || undefined}
                onValueChange={(v) => updateEditForm("source_type", v)}
                disabled={editLoading}
              >
                <SelectTrigger id="edit-source-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {source_type.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-source-url">URL</Label>
              <Input
                id="edit-source-url"
                type="url"
                value={editForm.url}
                onChange={(e) => updateEditForm("url", e.target.value)}
                placeholder="https://..."
                disabled={editLoading}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-source-ecosystem">Ecosystem key</Label>
                <Input
                  id="edit-source-ecosystem"
                  value={editForm.ecosystem_key}
                  onChange={(e) => updateEditForm("ecosystem_key", e.target.value)}
                  placeholder="Optional"
                  disabled={editLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-source-tier">Reliability tier</Label>
                <Select
                  value={editForm.reliability_tier || undefined}
                  onValueChange={(v) => updateEditForm("reliability_tier", v)}
                  disabled={editLoading}
                >
                  <SelectTrigger id="edit-source-tier">
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
            </div>
            {editError && (
              <p className="text-sm text-destructive">{editError}</p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeEdit}
                disabled={editLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editLoading}>
                {editLoading ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Add source</CardTitle>
          <CardDescription>
            Create a new source. Required: name and source type.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="source-name">Name *</Label>
              <Input
                id="source-name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="e.g. Reuters"
                disabled={submitLoading}
                maxLength={500}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="source-type">Source type *</Label>
              <Select
                value={form.source_type || undefined}
                onValueChange={(v) => update("source_type", v)}
                disabled={submitLoading}
              >
                <SelectTrigger id="source-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {source_type.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source-url">URL</Label>
              <Input
                id="source-url"
                type="url"
                value={form.url}
                onChange={(e) => update("url", e.target.value)}
                placeholder="https://..."
                disabled={submitLoading}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="source-ecosystem">Ecosystem key</Label>
                <Input
                  id="source-ecosystem"
                  value={form.ecosystem_key}
                  onChange={(e) => update("ecosystem_key", e.target.value)}
                  placeholder="Optional"
                  disabled={submitLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="source-tier">Reliability tier</Label>
                <Select
                  value={form.reliability_tier || undefined}
                  onValueChange={(v) => update("reliability_tier", v)}
                  disabled={submitLoading}
                >
                  <SelectTrigger id="source-tier">
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
            </div>
            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}
            {submitSuccess && (
              <p className="text-sm text-green-600 dark:text-green-400">
                Source created.
              </p>
            )}
            <Button type="submit" disabled={submitLoading}>
              {submitLoading ? "Creating…" : "Create source"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
