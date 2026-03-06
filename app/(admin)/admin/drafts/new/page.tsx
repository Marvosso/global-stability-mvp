"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "@/components/auth/SessionProvider";
import { createDraftEventSchema } from "@/app/api/_lib/validation";
import {
  event_category,
  event_subtype,
  severity_level,
} from "@/app/api/_lib/enums";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FormState = {
  title: string;
  summary: string;
  category: string;
  subtype: string;
  severity: string;
  occurred_at: string;
  primary_location: string;
  source_url: string;
};

const INITIAL_FORM: FormState = {
  title: "",
  summary: "",
  category: "",
  subtype: "",
  severity: "",
  occurred_at: "",
  primary_location: "",
  source_url: "",
};

/** Format datetime-local value to ISO string for API, or undefined if empty. */
function toOccurredAt(value: string): string | undefined {
  const t = value.trim();
  if (!t) return undefined;
  try {
    return new Date(t).toISOString();
  } catch {
    return undefined;
  }
}

export default function NewDraftPage() {
  const { session } = useSession();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const update = useCallback((key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setError(null);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setFieldErrors({});

      const payload = {
        title: form.title.trim(),
        summary: form.summary.trim(),
        category: form.category || undefined,
        subtype: form.subtype.trim() || undefined,
        severity: (form.severity || undefined) as "Low" | "Medium" | "High" | "Critical" | undefined,
        occurred_at: toOccurredAt(form.occurred_at),
        primary_location: form.primary_location.trim() || undefined,
        source_url: form.source_url.trim() || undefined,
        primary_classification: "Verified Event" as const,
        confidence_level: "Medium" as const,
      };

      const parsed = createDraftEventSchema.safeParse(payload);
      if (!parsed.success) {
        const flat = parsed.error.flatten();
        const errors = (flat.fieldErrors ?? {}) as Record<string, string[]>;
        setFieldErrors(errors);
        const first = parsed.error.errors[0];
        setError(first?.message ?? "Please fix the errors below.");
        return;
      }

      setSubmitting(true);
      try {
        const headers: HeadersInit = { "Content-Type": "application/json" };
        if (session?.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`;
        }
        const res = await fetch("/api/internal/drafts", {
          method: "POST",
          headers,
          body: JSON.stringify(parsed.data),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const message =
            typeof data?.error === "string" ? data.error : "Something went wrong.";
          const details = data?.details as { fieldErrors?: Record<string, string[]> } | undefined;
          const fromApi = details?.fieldErrors ?? {};
          setFieldErrors(fromApi);
    setError(message);
          return;
        }

        if (data?.id) {
          setCreatedId(data.id);
          setShowSuccessToast(true);
        } else {
          setError("Unexpected response: no event id returned.");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network or server error.");
      } finally {
        setSubmitting(false);
      }
    },
    [form, session?.access_token]
  );

  const getFieldError = (key: keyof FormState) => fieldErrors[key]?.[0];

  if (createdId) {
    return (
      <div id="admin_create_draft_event_ui" className="space-y-4">
        {showSuccessToast && (
          <div
            role="status"
            aria-live="polite"
            className="fixed top-4 right-4 z-50 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800 shadow-sm dark:border-green-800 dark:bg-green-950/80 dark:text-green-200"
          >
            Draft created successfully.
          </div>
        )}
        <h2 className="text-xl font-semibold">Draft created</h2>
        <Card>
          <CardHeader>
            <CardTitle>Success</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Event draft created with id: <strong>{createdId}</strong>
            </p>
            <Button asChild variant="outline">
              <Link href="/admin/review">Go to review page</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div id="admin_create_draft_event_ui" className="space-y-6">
      <h2 className="text-xl font-semibold">Create Draft Event</h2>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>New draft</CardTitle>
            <p className="text-sm text-muted-foreground">
              Create a draft event. Required fields are marked.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="Short title"
                maxLength={500}
                aria-invalid={!!getFieldError("title")}
                className="w-full"
              />
              {getFieldError("title") && (
                <p className="text-sm text-destructive">{getFieldError("title")}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="summary">
                Summary <span className="text-destructive">*</span>
              </Label>
              <textarea
                id="summary"
                value={form.summary}
                onChange={(e) => update("summary", e.target.value)}
                placeholder="Brief summary"
                maxLength={5000}
                rows={4}
                aria-invalid={!!getFieldError("summary")}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              {getFieldError("summary") && (
                <p className="text-sm text-destructive">{getFieldError("summary")}</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="category">
                  Category <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => update("category", v)}
                  required
                >
                  <SelectTrigger
                    id="category"
                    aria-invalid={!!getFieldError("category")}
                    className="w-full"
                  >
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {event_category.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {getFieldError("category") && (
                  <p className="text-sm text-destructive">{getFieldError("category")}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="subtype">Subtype</Label>
                <Select
                  value={form.subtype || "_none"}
                  onValueChange={(v) => update("subtype", v === "_none" ? "" : v)}
                >
                  <SelectTrigger id="subtype" className="w-full">
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {event_subtype.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {getFieldError("subtype") && (
                  <p className="text-sm text-destructive">{getFieldError("subtype")}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="severity">
                Severity <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.severity}
                onValueChange={(v) => update("severity", v)}
                required
              >
                <SelectTrigger
                  id="severity"
                  aria-invalid={!!getFieldError("severity")}
                  className="w-full"
                >
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  {severity_level.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {getFieldError("severity") && (
                <p className="text-sm text-destructive">{getFieldError("severity")}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="occurred_at">Occurred at</Label>
              <Input
                id="occurred_at"
                type="datetime-local"
                value={form.occurred_at}
                onChange={(e) => update("occurred_at", e.target.value)}
                aria-invalid={!!getFieldError("occurred_at")}
                className="w-full"
              />
              {getFieldError("occurred_at") && (
                <p className="text-sm text-destructive">{getFieldError("occurred_at")}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="primary_location">Primary location</Label>
              <Input
                id="primary_location"
                value={form.primary_location}
                onChange={(e) => update("primary_location", e.target.value)}
                placeholder="e.g. 40.7128, -74.0060"
                aria-invalid={!!getFieldError("primary_location")}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">Optional. Format: lat, lng</p>
              {getFieldError("primary_location") && (
                <p className="text-sm text-destructive">{getFieldError("primary_location")}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="source_url">Source URL</Label>
              <Input
                id="source_url"
                type="url"
                value={form.source_url}
                onChange={(e) => update("source_url", e.target.value)}
                placeholder="https://..."
                aria-invalid={!!getFieldError("source_url")}
                className="w-full"
              />
              {getFieldError("source_url") && (
                <p className="text-sm text-destructive">{getFieldError("source_url")}</p>
              )}
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create draft"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
