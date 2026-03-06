"use client";

import { useState } from "react";
import { createDraftEventSchema } from "@/app/api/_lib/validation";
import {
  event_category,
  event_subtype,
  confidence_level,
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
import { useSession } from "@/components/auth/SessionProvider";

const formSchema = createDraftEventSchema.pick({
  title: true,
  summary: true,
  category: true,
  subtype: true,
  primary_classification: true,
  secondary_classification: true,
  severity: true,
  confidence_level: true,
  details: true,
  source_url: true,
});

/** Severity 1–5 (UI) → API enum */
const SEVERITY_TO_API: Record<string, "Low" | "Medium" | "High" | "Critical"> = {
  "1": "Low",
  "2": "Medium",
  "3": "High",
  "4": "Critical",
  "5": "Critical",
};

/** Subtypes shown per category (frontend-only). Unlisted categories show all subtypes. */
const CATEGORY_SUBTYPES: Partial<
  Record<(typeof event_category)[number], (typeof event_subtype)[number][]>
> = {
  "Armed Conflict": ["Battle", "Targeted Assassination", "Air Strike", "Border Skirmish"],
  "Political Tension": ["Protest", "Legislation Dispute", "Government Crisis"],
  "Military Posture": ["Battle", "Air Strike", "Border Skirmish"],
  "Diplomatic Confrontation": ["Protest", "Legislation Dispute", "Government Crisis"],
  "Coercive Economic Action": ["Protest", "Legislation Dispute"],
};

const SEVERITY_OPTIONS = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
];

type FormValues = {
  title: string;
  summary: string;
  category: string;
  subtype: string;
  primary_classification: string;
  secondary_classification: string;
  severity: string;
  confidence_level: string;
  details: string;
  source_url: string;
};

const PRIMARY_CLASSIFICATION = ["Verified Event", "Disputed Claim"] as const;
const SECONDARY_CLASSIFICATION = [
  "Official Claim",
  "Opposition Claim",
] as const;

export type DraftFormSuccess = { id: string; status?: string };

type DraftFormProps = {
  onSuccess: (data: DraftFormSuccess) => void;
  onError: (message: string, fieldErrors?: Record<string, string[]>) => void;
};

export function DraftForm({ onSuccess, onError }: DraftFormProps) {
  const { session } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [form, setForm] = useState<FormValues>({
    title: "",
    summary: "",
    category: "",
    subtype: "",
    primary_classification: "",
    secondary_classification: "",
    severity: "",
    confidence_level: "Medium",
    details: "",
    source_url: "",
  });

  const update = (key: keyof FormValues, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "category") next.subtype = "";
      return next;
    });
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});

    const apiSeverity = SEVERITY_TO_API[form.severity] ?? "Low";
    const detailsTrimmed = form.details.trim() || undefined;

    const payload = {
      title: form.title.trim(),
      summary: form.summary.trim(),
      category: form.category || undefined,
      subtype: form.subtype ? form.subtype : undefined,
      primary_classification: form.primary_classification || undefined,
      secondary_classification: form.secondary_classification
        ? form.secondary_classification
        : undefined,
      severity: apiSeverity,
      confidence_level: form.confidence_level || "Medium",
      details: detailsTrimmed,
      source_url: form.source_url.trim() || undefined,
    };

    const parsed = formSchema.safeParse(payload);

    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const errors: Record<string, string[]> = { ...flat.fieldErrors } as Record<
        string,
        string[]
      >;
      setFieldErrors(errors);
      const first = parsed.error.errors[0];
      onError(first?.message ?? "Please fix the errors below.", errors);
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
          typeof data?.error === "string"
            ? data.error
            : "Something went wrong.";
        const details = data?.details as
          | { fieldErrors?: Record<string, string[]> }
          | undefined;
        const fieldErrorsFromApi = details?.fieldErrors ?? {};
        setFieldErrors(fieldErrorsFromApi);
        onError(message, fieldErrorsFromApi);
        return;
      }

      if (data?.id) {
        onSuccess({ id: data.id, status: data.status });
      } else {
        onError("Unexpected response: no event id returned.");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Network or server error.";
      onError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const getFieldError = (key: keyof FormValues) => fieldErrors[key]?.[0];

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>New draft</CardTitle>
          <p className="text-sm text-muted-foreground">
            Create a draft event. Required fields are marked.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
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
                <p className="text-sm text-destructive">
                  {getFieldError("category")}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="subtype">Subtype</Label>
              <Select
                value={
                  form.subtype || "_none"
                }
                onValueChange={(v) => update("subtype", v === "_none" ? "" : v)}
              >
                <SelectTrigger id="subtype" className="w-full">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {(form.category && CATEGORY_SUBTYPES[form.category as keyof typeof CATEGORY_SUBTYPES]
                    ? CATEGORY_SUBTYPES[form.category as keyof typeof CATEGORY_SUBTYPES]!
                    : [...event_subtype]
                  ).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

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
              <p className="text-sm text-destructive">
                {getFieldError("title")}
              </p>
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
              <p className="text-sm text-destructive">
                {getFieldError("summary")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="details">Details / notes</Label>
            <textarea
              id="details"
              value={form.details}
              onChange={(e) => update("details", e.target.value)}
              placeholder="Optional additional details"
              maxLength={100_000}
              rows={3}
              aria-invalid={!!getFieldError("details")}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            {getFieldError("details") && (
              <p className="text-sm text-destructive">
                {getFieldError("details")}
              </p>
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
            <p className="text-xs text-muted-foreground">
              Optional. If the URL is not already a source, a pending source candidate will be created for review.
            </p>
            {getFieldError("source_url") && (
              <p className="text-sm text-destructive">
                {getFieldError("source_url")}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="severity">
                Severity (1–5) <span className="text-destructive">*</span>
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
                  <SelectValue placeholder="Select 1–5" />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {getFieldError("severity") && (
                <p className="text-sm text-destructive">
                  {getFieldError("severity")}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confidence_level">Confidence</Label>
              <Select
                value={form.confidence_level}
                onValueChange={(v) => update("confidence_level", v)}
              >
                <SelectTrigger id="confidence_level" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {confidence_level.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="primary_classification">
                Primary classification <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.primary_classification}
                onValueChange={(v) => update("primary_classification", v)}
                required
              >
                <SelectTrigger
                  id="primary_classification"
                  aria-invalid={!!getFieldError("primary_classification")}
                  className="w-full"
                >
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {PRIMARY_CLASSIFICATION.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {getFieldError("primary_classification") && (
                <p className="text-sm text-destructive">
                  {getFieldError("primary_classification")}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="secondary_classification">
                Secondary classification
              </Label>
              <Select
                value={form.secondary_classification || "_none"}
                onValueChange={(v) =>
                  update(
                    "secondary_classification",
                    v === "_none" ? "" : v
                  )
                }
              >
                <SelectTrigger id="secondary_classification" className="w-full">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {SECONDARY_CLASSIFICATION.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="pt-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create draft"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
