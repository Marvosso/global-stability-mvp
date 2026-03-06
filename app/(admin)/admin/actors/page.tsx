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
import { actor_type, actor_alignment } from "@/app/api/_lib/enums";
import { useSession } from "@/components/auth/SessionProvider";

type Actor = {
  id: string;
  name: string;
  canonical_name?: string | null;
  actor_type: string;
  alignment: string;
  affiliation_label: string;
  country_code?: string | null;
  notes?: string | null;
  created_at?: string;
};

type ActorApi = Partial<Actor> & { id?: string };

type ActorForm = {
  name: string;
  canonical_name: string;
  actor_type: string;
  alignment: string;
  affiliation_label: string;
  affiliated_to_actor_id: string;
  country_code: string;
  notes: string;
};

const INITIAL_FORM: ActorForm = {
  name: "",
  canonical_name: "",
  actor_type: "",
  alignment: "",
  affiliation_label: "",
  affiliated_to_actor_id: "",
  country_code: "",
  notes: "",
};

export default function ActorsPage() {
  const { session, isLoading } = useSession();
  const [actors, setActors] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ActorForm>(INITIAL_FORM);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    if (isLoading || !session?.access_token) return;
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch("/api/internal/actors", {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(async (res) => {
        const text = await res.text();
        if (!res.ok) {
          throw new Error(`Failed to load actors: HTTP ${res.status} - ${text || res.statusText}`);
        }
        return text ? JSON.parse(text) : [];
      })
      .then((data) => {
        if (cancelled || controller.signal.aborted) return;
        const list = Array.isArray(data) ? data : data?.data ?? [];
        setActors(list);
      })
      .catch((err) => {
        if (cancelled || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load actors");
      })
      .finally(() => {
        if (!cancelled && !controller.signal.aborted) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isLoading, session?.access_token]);

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

  const update = (field: keyof ActorForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSubmitError(null);
    setSubmitSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    const affiliation_label = form.affiliation_label.trim();
    if (!name) {
      setSubmitError("Name is required.");
      return;
    }
    if (!form.actor_type) {
      setSubmitError("Actor type is required.");
      return;
    }
    if (!form.alignment) {
      setSubmitError("Alignment is required.");
      return;
    }
    if (!affiliation_label) {
      setSubmitError("Affiliation label is required.");
      return;
    }
    const country = form.country_code.trim();
    if (country && country.length !== 2) {
      setSubmitError("Country code must be 2 characters.");
      return;
    }
    if (form.notes.length > 2000) {
      setSubmitError("Notes must be 2000 characters or fewer.");
      return;
    }
    setSubmitError(null);
    setSubmitLoading(true);
    try {
      const body: Record<string, unknown> = {
        name,
        actor_type: form.actor_type,
        alignment: form.alignment,
        affiliation_label,
      };
      if (form.canonical_name.trim()) body.canonical_name = form.canonical_name.trim();
      if (form.affiliated_to_actor_id.trim()) {
        body.affiliated_to_actor_id = form.affiliated_to_actor_id.trim();
      }
      if (country) body.country_code = country;
      if (form.notes.trim()) body.notes = form.notes.trim();
      const res = await fetch("/api/internal/actors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: ActorApi | undefined;
      try {
        if (text) data = JSON.parse(text) as ActorApi;
      } catch {
        /* non-JSON response */
      }
      if (!res.ok) {
        let msg = "Failed to create actor.";
        try {
          const parsed = text ? (JSON.parse(text) as { error?: string }) : null;
          if (parsed?.error) msg = parsed.error;
        } catch {
          // keep default
        }
        setSubmitError(`HTTP ${res.status} - ${msg}${text ? ` | ${text}` : ""}`);
        return;
      }
      setForm(INITIAL_FORM);
      setSubmitSuccess(true);
      const newId = data?.id;
      if (typeof newId === "string") {
        setActors((prev) => [
          {
            id: newId,
            name: data?.name ?? name,
            canonical_name: data?.canonical_name ?? null,
            actor_type: data?.actor_type ?? form.actor_type,
            alignment: data?.alignment ?? form.alignment,
            affiliation_label: data?.affiliation_label ?? affiliation_label,
            country_code: data?.country_code ?? (country || null),
            notes: data?.notes ?? (form.notes.trim() || null),
            created_at: data?.created_at,
          },
          ...prev,
        ]);
      } else {
        setLoading(true);
        setError(null);
        fetch("/api/internal/actors", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
          .then(async (r) => {
            const text = await r.text();
            if (!r.ok) {
              throw new Error(`Failed to reload actors: HTTP ${r.status} - ${text || r.statusText}`);
            }
            return text ? JSON.parse(text) : [];
          })
          .then((list) => {
            setActors(Array.isArray(list) ? list : list?.data ?? []);
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : "Failed to reload actors");
          })
          .finally(() => setLoading(false));
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to create actor."
      );
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Actors</h2>

      <Card>
        <CardHeader>
          <CardTitle>All actors</CardTitle>
          <CardDescription>
            Actors that can be linked to events. Create one below.
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
          {!loading && !error && actors.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No actors yet. Create one below.
            </p>
          )}
          {!loading && !error && actors.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Alignment</TableHead>
                  <TableHead>Affiliation</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actors.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell>{a.actor_type}</TableCell>
                    <TableCell>{a.alignment}</TableCell>
                    <TableCell>{a.affiliation_label}</TableCell>
                    <TableCell>{a.country_code ?? "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {a.notes ?? "—"}
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
          <CardTitle>Add actor</CardTitle>
          <CardDescription>
            Create a new actor. Required fields: name, type, alignment, affiliation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="actor-name">Name *</Label>
                <Input
                  id="actor-name"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="e.g. Ministry of Defence"
                  disabled={submitLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="actor-canonical">Canonical name</Label>
                <Input
                  id="actor-canonical"
                  value={form.canonical_name}
                  onChange={(e) => update("canonical_name", e.target.value)}
                  placeholder="Optional"
                  disabled={submitLoading}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="actor-type">Actor type *</Label>
                <Select
                  value={form.actor_type || undefined}
                  onValueChange={(v) => update("actor_type", v)}
                  disabled={submitLoading}
                >
                  <SelectTrigger id="actor-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {actor_type.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="actor-alignment">Alignment *</Label>
                <Select
                  value={form.alignment || undefined}
                  onValueChange={(v) => update("alignment", v)}
                  disabled={submitLoading}
                >
                  <SelectTrigger id="actor-alignment">
                    <SelectValue placeholder="Select alignment" />
                  </SelectTrigger>
                  <SelectContent>
                    {actor_alignment.map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="actor-affiliation">Affiliation label *</Label>
              <Input
                id="actor-affiliation"
                value={form.affiliation_label}
                onChange={(e) => update("affiliation_label", e.target.value)}
                placeholder="e.g. Government of X"
                disabled={submitLoading}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="actor-affiliated-to">Affiliated to actor (UUID)</Label>
                <Input
                  id="actor-affiliated-to"
                  value={form.affiliated_to_actor_id}
                  onChange={(e) => update("affiliated_to_actor_id", e.target.value)}
                  placeholder="Optional UUID"
                  disabled={submitLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="actor-country">Country code (2 letters)</Label>
                <Input
                  id="actor-country"
                  value={form.country_code}
                  onChange={(e) =>
                    update("country_code", e.target.value.toUpperCase().slice(0, 2))
                  }
                  placeholder="e.g. US"
                  maxLength={2}
                  disabled={submitLoading}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="actor-notes">Notes</Label>
              <textarea
                id="actor-notes"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Optional, max 2000 characters"
                rows={2}
                maxLength={2001}
                disabled={submitLoading}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              />
            </div>
            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}
            {submitSuccess && (
              <p className="text-sm text-green-600 dark:text-green-400">
                Actor created.
              </p>
            )}
            <Button type="submit" disabled={submitLoading}>
              {submitLoading ? "Creating…" : "Create actor"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
