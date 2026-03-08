"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { ClassificationBadge } from "@/components/ui/classification-badge";
import { AttributionLine } from "@/components/ui/attribution-line";
import { useSession } from "@/components/auth/SessionProvider";
import { getRoleFromUser } from "@/lib/roles";

type ActorRef = {
  id: string;
  name: string;
  actor_type: string;
  alignment: string;
  affiliation_label: string;
  country_code?: string | null;
  notes?: string | null;
};

type SourceRef = {
  id: string;
  name: string;
  source_type: string;
  url?: string | null;
  reliability_tier?: string | null;
};

type EventActor = {
  actor_id: string;
  role: string;
  is_primary?: boolean;
  notes?: string | null;
  actor: ActorRef | null;
};

type EventSource = {
  id?: string;
  source_id: string;
  claim_url?: string | null;
  claim_timestamp?: string | null;
  source_primary_classification?: string | null;
  source_secondary_classification?: string | null;
  source_confidence_level?: string | null;
  raw_excerpt?: string | null;
  source: SourceRef | null;
};

type IngestionItem = {
  source_url: string;
  payload: unknown;
};

type EventContextRow = {
  event_id: string;
  one_paragraph_summary: string | null;
  background: string | null;
  trigger: string | null;
  updated_at: string;
  summary?: string | null;
  why_it_matters?: string | null;
  likely_driver?: string | null;
  uncertainty_note?: string | null;
  generated_by?: string | null;
  status?: string | null;
  created_at?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
} | null;

type EventClaimRow = {
  id: string;
  claim_text: string;
  claim_type: string | null;
  actor_name: string | null;
  classification: string | null;
  evidence_source_url: string | null;
  confidence_level: string | null;
  created_at: string;
};

type EventFactRow = {
  id: string;
  fact_text: string;
  evidence_source_url: string | null;
  confidence_level: string | null;
  created_at: string;
};

type EventClaimCandidateRow = {
  id: string;
  event_id: string;
  claim_text: string;
  claim_type: string | null;
  actor_name: string | null;
  classification: string | null;
  confidence_level: string | null;
  evidence_source_url: string | null;
  source_name: string | null;
  model: string | null;
  created_at: string;
};

type ClaimConflictRow = {
  id: string;
  event_id: string;
  claim_a_id: string;
  claim_b_id: string;
  conflict_score: number;
  reason: string;
  created_at: string;
};

/** Response shape from GET /api/internal/review/event/[id] */
type EventDetail = {
  id: string;
  created_at: string;
  updated_at?: string;
  title: string;
  summary: string;
  details?: string | null;
  category: string;
  subtype: string | null;
  primary_classification?: string;
  secondary_classification?: string | null;
  severity: string;
  confidence_level: string;
  confidence_score: number | null;
  status: string;
  requires_dual_review?: boolean;
  last_reviewed_by?: string | null;
  occurred_at?: string | null;
  ended_at?: string | null;
  primary_location?: string | null;
  actors: EventActor[];
  sources: EventSource[];
  ingestion_items?: IngestionItem[];
  context_background?: string | null;
  key_parties?: string | null;
  competing_claims?: Array<{
    claim: string;
    attributed_to?: string | null;
    confidence?: string | null;
  }> | null;
  event_context?: EventContextRow;
  event_claims?: EventClaimRow[];
  event_facts?: EventFactRow[];
  event_claim_candidates?: EventClaimCandidateRow[];
  claim_conflicts?: ClaimConflictRow[];
};

function formatDate(iso: string | null | undefined): string {
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

export default function ReviewDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = params.id;
  const router = useRouter();
  const { user, session, isLoading } = useSession();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [justification, setJustification] = useState("");
  const [actionLoading, setActionLoading] = useState<"approve" | "reject" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<"approved" | "rejected" | null>(null);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [recalculateLoading, setRecalculateLoading] = useState(false);
  const [recalculateError, setRecalculateError] = useState<string | null>(null);
  const [confidenceLog, setConfidenceLog] = useState<
    Array<{
      id: string;
      changed_field: string;
      old_value: string | null;
      new_value: string;
      justification: string;
      changed_at: string;
    }>
  >([]);
  const [confidenceLogLoading, setConfidenceLogLoading] = useState(false);
  const [confidenceLogError, setConfidenceLogError] = useState<string | null>(null);
  const [contextBackground, setContextBackground] = useState("");
  const [keyParties, setKeyParties] = useState("");
  const [claims, setClaims] = useState<Array<{ claim: string; attributed_to: string; confidence: string }>>([]);
  const [contextSaveLoading, setContextSaveLoading] = useState(false);
  const [contextSaveError, setContextSaveError] = useState<string | null>(null);
  const [contextSaveSuccess, setContextSaveSuccess] = useState(false);
  const [contextSummary, setContextSummary] = useState("");
  const [contextWhyItMatters, setContextWhyItMatters] = useState("");
  const [contextLikelyDriver, setContextLikelyDriver] = useState("");
  const [contextUncertaintyNote, setContextUncertaintyNote] = useState("");
  const [contextGenerateLoading, setContextGenerateLoading] = useState(false);
  const [contextGenerateError, setContextGenerateError] = useState<string | null>(null);
  const [contextAnalysisSaveLoading, setContextAnalysisSaveLoading] = useState(false);
  const [contextAnalysisSaveError, setContextAnalysisSaveError] = useState<string | null>(null);
  const [contextAnalysisSaveSuccess, setContextAnalysisSaveSuccess] = useState(false);
  const [contextApproveLoading, setContextApproveLoading] = useState(false);
  const [contextRejectLoading, setContextRejectLoading] = useState(false);
  const [contextActionError, setContextActionError] = useState<string | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<{
    brief_json: { summary: string; key_points: string[] };
    version: number;
    generated_at: string;
    status: string;
  } | null>(null);
  const [addClaimLoading, setAddClaimLoading] = useState(false);
  const [addClaimError, setAddClaimError] = useState<string | null>(null);
  const [addClaimForm, setAddClaimForm] = useState({
    claim_text: "",
    actor_name: "",
    classification: "Verified Event" as "Verified Event" | "Disputed Claim",
    confidence_level: "",
    evidence_source_url: "",
  });
  const [addFactLoading, setAddFactLoading] = useState(false);
  const [addFactError, setAddFactError] = useState<string | null>(null);
  const [addFactForm, setAddFactForm] = useState({
    fact_text: "",
    evidence_source_url: "",
    confidence_level: "",
  });
  const [extractClaimsLoading, setExtractClaimsLoading] = useState(false);
  const [extractClaimsError, setExtractClaimsError] = useState<string | null>(null);
  const [extractSourceId, setExtractSourceId] = useState<string>("");
  const [detectContradictionsLoading, setDetectContradictionsLoading] = useState(false);
  const [detectContradictionsError, setDetectContradictionsError] = useState<string | null>(null);
  const [candidateActionId, setCandidateActionId] = useState<string | null>(null);
  const [approveUrlOverrides, setApproveUrlOverrides] = useState<Record<string, string>>({});

  const authHeaders: HeadersInit = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};

  const fetchEvent = useCallback(() => {
    if (!id || !session?.access_token) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    fetch(`/api/internal/review/event/${id}`, { headers: authHeaders })
      .then((res) => {
        if (res.status === 404) {
          setNotFound(true);
          return null;
        }
        if (res.status === 401 || res.status === 403) {
          setError("Not authorized");
          return null;
        }
        if (!res.ok) throw new Error("Failed to load event");
        return res.json();
      })
      .then((data: EventDetail | null) => {
        if (data) setEvent(data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load event");
      })
      .finally(() => setLoading(false));
  }, [id, session?.access_token]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    if (isLoading || !session?.access_token) return;
    fetchEvent();
  }, [id, isLoading, session?.access_token, fetchEvent]);

  useEffect(() => {
    if (!event) return;
    setContextBackground(event.context_background ?? "");
    setKeyParties(event.key_parties ?? "");
    setClaims(
      (event.competing_claims ?? []).length > 0
        ? (event.competing_claims ?? []).map((c) => ({
            claim: c.claim ?? "",
            attributed_to: c.attributed_to ?? "",
            confidence: c.confidence ?? "",
          }))
        : []
    );
    const ec = event.event_context;
    if (ec && typeof ec === "object") {
      setContextSummary(ec.summary ?? "");
      setContextWhyItMatters(ec.why_it_matters ?? "");
      setContextLikelyDriver(ec.likely_driver ?? "");
      setContextUncertaintyNote(ec.uncertainty_note ?? "");
    } else {
      setContextSummary("");
      setContextWhyItMatters("");
      setContextLikelyDriver("");
      setContextUncertaintyNote("");
    }
  }, [event?.id, event?.context_background, event?.key_parties, event?.competing_claims, event?.event_context]);

  useEffect(() => {
    if (!id || !event || !session?.access_token) return;
    let cancelled = false;
    setConfidenceLogLoading(true);
    setConfidenceLogError(null);
    fetch(`/api/internal/events/${id}/confidence-log`, { headers: authHeaders })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load confidence history");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setConfidenceLog(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!cancelled)
          setConfidenceLogError(
            err instanceof Error ? err.message : "Failed to load confidence history"
          );
      })
      .finally(() => {
        if (!cancelled) setConfidenceLogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, event?.id, session?.access_token]);

  useEffect(() => {
    if (!id || !session?.access_token || event?.status !== "Published") return;
    let cancelled = false;
    setBriefingLoading(true);
    setBriefingError(null);
    fetch(`/api/internal/events/${id}/briefing`, { headers: authHeaders })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load briefing");
        return res.json();
      })
      .then((data: { briefing: typeof briefing }) => {
        if (!cancelled) setBriefing(data.briefing ?? null);
      })
      .catch((err) => {
        if (!cancelled)
          setBriefingError(err instanceof Error ? err.message : "Failed to load briefing");
      })
      .finally(() => {
        if (!cancelled) setBriefingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, event?.id, event?.status, session?.access_token]);

  useEffect(() => {
    if (!successMessage) return;
    const t = setTimeout(() => {
      router.push("/admin/review-queue");
    }, 1500);
    return () => clearTimeout(t);
  }, [successMessage, router]);

  const handleApprove = async () => {
    const j = justification.trim();
    if (!j) {
      setActionError("Justification is required.");
      return;
    }
    setActionError(null);
    setActionLoading("approve");
    try {
      const res = await fetch(`/api/internal/review/${id}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({ justification: j }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setActionError("Not authorized");
        } else if (typeof (data as any)?.error === "string") {
          setActionError((data as any).error);
        } else {
          setActionError("Approve failed.");
        }
        return;
      }
      setSuccessMessage("approved");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Approve failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectConfirm = async () => {
    const j = justification.trim();
    if (!j) {
      setActionError("Justification is required to reject.");
      return;
    }
    setActionError(null);
    setActionLoading("reject");
    try {
      const res = await fetch(`/api/internal/review/${id}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({ justification: j }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setActionError("Not authorized");
        } else if (typeof (data as any)?.error === "string") {
          setActionError((data as any).error);
        } else {
          setActionError("Reject failed.");
        }
        return;
      }
      setShowRejectConfirm(false);
      setSuccessMessage("rejected");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Reject failed.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRecalculateConfidence = async () => {
    setRecalculateError(null);
    setRecalculateLoading(true);
    try {
      const res = await fetch(`/api/internal/confidence/${id}`, {
        method: "POST",
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRecalculateError(
          typeof data?.error === "string" ? data.error : "Recalculation failed."
        );
        return;
      }
      const score = data.confidence_score;
      const level = data.confidence_level;
      setEvent((prev) =>
        prev
          ? {
              ...prev,
              confidence_score: score ?? prev.confidence_score,
              confidence_level: typeof level === "string" ? level : prev.confidence_level,
            }
          : null
      );
      const logRes = await fetch(`/api/internal/events/${id}/confidence-log`, {
        headers: authHeaders,
      });
      if (logRes.ok) {
        const logData = await logRes.json().catch(() => []);
        setConfidenceLog(Array.isArray(logData) ? logData : []);
      }
    } catch (err) {
      setRecalculateError(
        err instanceof Error ? err.message : "Recalculation failed."
      );
    } finally {
      setRecalculateLoading(false);
    }
  };

  const handleSaveContext = async () => {
    setContextSaveError(null);
    setContextSaveSuccess(false);
    setContextSaveLoading(true);
    try {
      const cleanedClaims = claims
        .filter((c) => c.claim.trim() !== "")
        .map((c) => ({
          claim: c.claim.trim(),
          attributed_to: c.attributed_to.trim() || null,
          confidence: c.confidence.trim() || null,
        }));
      const body = {
        context_background: contextBackground.trim() || null,
        key_parties: keyParties.trim() || null,
        competing_claims: cleanedClaims.length > 0 ? cleanedClaims : null,
      };
      const res = await fetch(`/api/internal/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setContextSaveError(
          typeof data?.error === "string" ? data.error : "Failed to save context"
        );
        return;
      }
      setContextSaveSuccess(true);
      fetchEvent();
      setTimeout(() => setContextSaveSuccess(false), 3000);
    } catch (err) {
      setContextSaveError(err instanceof Error ? err.message : "Failed to save context");
    } finally {
      setContextSaveLoading(false);
    }
  };

  const handleGenerateContext = async () => {
    setContextGenerateError(null);
    setContextActionError(null);
    setContextGenerateLoading(true);
    try {
      const res = await fetch(`/api/internal/events/${id}/context/generate`, {
        method: "POST",
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setContextGenerateError(typeof data?.error === "string" ? data.error : "Failed to generate context draft");
        return;
      }
      fetchEvent();
      setContextSummary(data.summary ?? "");
      setContextWhyItMatters(data.why_it_matters ?? "");
      setContextLikelyDriver(data.likely_driver ?? "");
      setContextUncertaintyNote(data.uncertainty_note ?? "");
    } catch (err) {
      setContextGenerateError(err instanceof Error ? err.message : "Failed to generate context draft");
    } finally {
      setContextGenerateLoading(false);
    }
  };

  const handleSaveContextAnalysis = async () => {
    setContextAnalysisSaveError(null);
    setContextActionError(null);
    setContextAnalysisSaveSuccess(false);
    setContextAnalysisSaveLoading(true);
    try {
      const res = await fetch(`/api/internal/events/${id}/context`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          summary: contextSummary.trim() || null,
          why_it_matters: contextWhyItMatters.trim() || null,
          likely_driver: contextLikelyDriver.trim() || null,
          uncertainty_note: contextUncertaintyNote.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setContextAnalysisSaveError(
          typeof data?.error === "string" ? data.error : "Event context not found. Generate a draft first."
        );
        return;
      }
      setContextAnalysisSaveSuccess(true);
      fetchEvent();
      setTimeout(() => setContextAnalysisSaveSuccess(false), 3000);
    } catch (err) {
      setContextAnalysisSaveError(err instanceof Error ? err.message : "Failed to save context analysis");
    } finally {
      setContextAnalysisSaveLoading(false);
    }
  };

  const handleApproveContext = async () => {
    setContextActionError(null);
    setContextApproveLoading(true);
    try {
      const res = await fetch(`/api/internal/events/${id}/context/approve`, {
        method: "POST",
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setContextActionError(typeof data?.error === "string" ? data.error : "Failed to approve context");
        return;
      }
      fetchEvent();
    } catch (err) {
      setContextActionError(err instanceof Error ? err.message : "Failed to approve context");
    } finally {
      setContextApproveLoading(false);
    }
  };

  const handleRejectContext = async () => {
    setContextActionError(null);
    setContextRejectLoading(true);
    try {
      const res = await fetch(`/api/internal/events/${id}/context/reject`, {
        method: "POST",
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setContextActionError(typeof data?.error === "string" ? data.error : "Failed to reject context");
        return;
      }
      fetchEvent();
    } catch (err) {
      setContextActionError(err instanceof Error ? err.message : "Failed to reject context");
    } finally {
      setContextRejectLoading(false);
    }
  };

  const handleAddClaim = async () => {
    const { claim_text, actor_name, classification, confidence_level, evidence_source_url } = addClaimForm;
    if (!claim_text.trim() || !actor_name.trim() || !confidence_level.trim() || !evidence_source_url.trim()) {
      setAddClaimError("Claim text, actor name, confidence level, and evidence URL are required.");
      return;
    }
    setAddClaimError(null);
    setAddClaimLoading(true);
    try {
      const res = await fetch(`/api/internal/events/${id}/claims`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          claim_text: claim_text.trim(),
          actor_name: actor_name.trim(),
          classification,
          confidence_level: confidence_level.trim(),
          evidence_source_url: evidence_source_url.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddClaimError(typeof data?.error === "string" ? data.error : "Failed to add claim");
        return;
      }
      setAddClaimForm({ claim_text: "", actor_name: "", classification: "Verified Event", confidence_level: "", evidence_source_url: "" });
      fetchEvent();
    } catch (err) {
      setAddClaimError(err instanceof Error ? err.message : "Failed to add claim");
    } finally {
      setAddClaimLoading(false);
    }
  };

  const handleExtractClaims = async () => {
    if (!extractSourceId.trim()) {
      setExtractClaimsError("Select a source to extract from.");
      return;
    }
    setExtractClaimsError(null);
    setExtractClaimsLoading(true);
    try {
      const res = await fetch(`/api/internal/events/${id}/claims/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ event_source_id: extractSourceId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExtractClaimsError(typeof data?.error === "string" ? data.error : "Failed to extract claims");
        return;
      }
      setExtractClaimsError(null);
      fetchEvent();
    } catch (err) {
      setExtractClaimsError(err instanceof Error ? err.message : "Failed to extract claims");
    } finally {
      setExtractClaimsLoading(false);
    }
  };

  const handleApproveCandidate = async (candidateId: string, evidenceSourceUrlOverride?: string) => {
    setCandidateActionId(candidateId);
    try {
      const body: { evidence_source_url?: string } = {};
      const url = evidenceSourceUrlOverride?.trim() ?? approveUrlOverrides[candidateId]?.trim();
      if (url) body.evidence_source_url = url;
      const res = await fetch(`/api/internal/events/${id}/claims/candidates/${candidateId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExtractClaimsError(typeof data?.error === "string" ? data.error : "Failed to approve claim");
        return;
      }
      setExtractClaimsError(null);
      setApproveUrlOverrides((prev) => {
        const next = { ...prev };
        delete next[candidateId];
        return next;
      });
      fetchEvent();
    } catch (err) {
      setExtractClaimsError(err instanceof Error ? err.message : "Failed to approve claim");
    } finally {
      setCandidateActionId(null);
    }
  };

  const handleRejectCandidate = async (candidateId: string) => {
    setCandidateActionId(candidateId);
    try {
      const res = await fetch(`/api/internal/events/${id}/claims/candidates/${candidateId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setExtractClaimsError(typeof data?.error === "string" ? data.error : "Failed to reject claim");
        return;
      }
      setExtractClaimsError(null);
      fetchEvent();
    } catch (err) {
      setExtractClaimsError(err instanceof Error ? err.message : "Failed to reject claim");
    } finally {
      setCandidateActionId(null);
    }
  };

  const handleDetectContradictions = async () => {
    setDetectContradictionsError(null);
    setDetectContradictionsLoading(true);
    try {
      const res = await fetch(`/api/internal/events/${id}/claims/detect-contradictions`, {
        method: "POST",
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDetectContradictionsError(typeof data?.error === "string" ? data.error : "Failed to detect contradictions");
        return;
      }
      fetchEvent();
    } catch (err) {
      setDetectContradictionsError(err instanceof Error ? err.message : "Failed to detect contradictions");
    } finally {
      setDetectContradictionsLoading(false);
    }
  };

  const handleAddFact = async () => {
    const { fact_text, evidence_source_url, confidence_level } = addFactForm;
    if (!fact_text.trim()) {
      setAddFactError("Fact text is required.");
      return;
    }
    setAddFactError(null);
    setAddFactLoading(true);
    try {
      const res = await fetch(`/api/internal/events/${id}/facts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          fact_text: fact_text.trim(),
          evidence_source_url: evidence_source_url?.trim() || undefined,
          confidence_level: confidence_level?.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddFactError(typeof data?.error === "string" ? data.error : "Failed to add fact");
        return;
      }
      setAddFactForm({ fact_text: "", evidence_source_url: "", confidence_level: "" });
      fetchEvent();
    } catch (err) {
      setAddFactError(err instanceof Error ? err.message : "Failed to add fact");
    } finally {
      setAddFactLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Event details</h2>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="h-6 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-20 animate-pulse rounded bg-muted" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Event details</h2>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/admin/review-queue">Back to review queue</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Event details</h2>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Event not found. It may be outside the current review queue or the
              ID is invalid.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/admin/review-queue">Back to review queue</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sources = event.sources ?? [];
  const actors = event.actors ?? [];
  const ingestionItems = event.ingestion_items ?? [];
  const isUnderReview = event.status === "UnderReview";
  const requiresDualReview = event.requires_dual_review === true;
  const currentUserId = user?.id ?? null;
  const isFirstReviewer =
    requiresDualReview &&
    currentUserId != null &&
    event.last_reviewed_by != null &&
    event.last_reviewed_by === currentUserId;
  const actionsDisabled = requiresDualReview && isFirstReviewer;
  const isAdmin = getRoleFromUser(user) === "Admin";

  return (
    <div className="space-y-6">
      {successMessage && (
        <Card className="border-green-600/50 bg-green-50 dark:bg-green-950/20 dark:border-green-800/50">
          <CardContent className="pt-6">
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              Event {successMessage}. Redirecting to review queue…
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">Event details</h2>
        <Button asChild variant="outline">
          <Link href="/admin/review-queue">Back to review queue</Link>
        </Button>
      </div>

      {isUnderReview && (
        <Card>
          <CardHeader>
            <CardTitle>Review actions</CardTitle>
            <CardDescription>
              Add a justification and approve or reject this event.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {requiresDualReview && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950/30">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  Dual review required.
                </p>
                {currentUserId != null && event.last_reviewed_by != null && (
                  <p className="mt-1 text-amber-700 dark:text-amber-300">
                    {isFirstReviewer
                      ? "You are the first reviewer. A different reviewer must approve or reject."
                      : "You are the second reviewer. You may approve or reject."}
                  </p>
                )}
                {currentUserId == null && (
                  <p className="mt-1 text-amber-700 dark:text-amber-300">
                    A different reviewer must perform the final approve or reject.
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="justification">Justification</Label>
              <textarea
                id="justification"
                value={justification}
                onChange={(e) => {
                  setJustification(e.target.value);
                  if (actionError) setActionError(null);
                }}
                placeholder="Required for audit"
                rows={3}
                disabled={!!actionLoading}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            {actionError && (
              <p className="text-sm text-destructive">{actionError}</p>
            )}
            {!showRejectConfirm ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleApprove}
                  disabled={!!actionLoading || actionsDisabled}
                >
                  {actionLoading === "approve" ? "Approving…" : "Approve"}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowRejectConfirm(true)}
                  disabled={!!actionLoading || actionsDisabled}
                >
                  Reject
                </Button>
              </div>
            ) : (
              <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
                <p className="text-sm font-medium">Confirm reject</p>
                <p className="text-sm text-muted-foreground">
                  This will set the event to Rejected. Justification is required above.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="destructive"
                    onClick={handleRejectConfirm}
                    disabled={!!actionLoading || actionsDisabled}
                  >
                    {actionLoading === "reject" ? "Rejecting…" : "Confirm Reject"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowRejectConfirm(false);
                      setActionError(null);
                    }}
                    disabled={!!actionLoading}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>ID: {event.id}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Title</h3>
            <p className="mt-1 text-sm font-medium">{event.title || "Untitled"}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">Summary</h3>
            <p className="mt-1 text-sm">{event.summary || "—"}</p>
          </div>
          {event.details?.trim() && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Details</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm">{event.details}</p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Category</h3>
              <p className="mt-1 text-sm">{event.category}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Subtype</h3>
              <p className="mt-1 text-sm">{event.subtype ?? "—"}</p>
            </div>
            {event.primary_classification && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Primary classification</h3>
                <p className="mt-1 text-sm">{event.primary_classification}</p>
              </div>
            )}
            {event.secondary_classification && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Secondary classification</h3>
                <p className="mt-1 text-sm">{event.secondary_classification}</p>
              </div>
            )}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Severity</h3>
              <p className="mt-1 text-sm">{event.severity}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Confidence</h3>
              <p className="mt-1 text-sm">
                {event.confidence_level}
                {event.confidence_score != null && ` (${event.confidence_score})`}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Occurred at</h3>
              <p className="mt-1 text-sm">{formatDate(event.occurred_at)}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Status</h3>
              <p className="mt-1 text-sm">{event.status}</p>
            </div>
          </div>
          {isAdmin && (
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRecalculateConfidence}
                disabled={recalculateLoading}
              >
                {recalculateLoading ? "Recalculating…" : "Recalculate Confidence"}
              </Button>
              {recalculateError && (
                <p className="text-sm text-destructive">{recalculateError}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Briefing (only when Published) */}
      {event.status === "Published" && (
        <Card>
          <CardHeader>
            <CardTitle>Briefing</CardTitle>
            <CardDescription>
              AI-generated briefing. Not visible to public until Approved.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {briefingLoading && (
              <p className="text-sm text-muted-foreground">Loading briefing…</p>
            )}
            {briefingError && (
              <p className="text-sm text-destructive">{briefingError}</p>
            )}
            {!briefingLoading && !briefingError && !briefing && (
              <p className="text-sm text-muted-foreground">
                No briefing yet. It will be generated shortly after publish.
              </p>
            )}
            {!briefingLoading && !briefingError && briefing && (
              <>
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <span>Status: {briefing.status}</span>
                  <span>Version: {briefing.version}</span>
                  <span>{formatDate(briefing.generated_at)}</span>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Summary</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{briefing.brief_json.summary}</p>
                </div>
                {briefing.brief_json.key_points?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground">Key points</h3>
                    <ul className="mt-1 list-inside list-disc space-y-1 text-sm">
                      {briefing.brief_json.key_points.map((point, idx) => (
                        <li key={idx}>{point}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Location */}
      {event.primary_location?.trim() && (
        <Card>
          <CardHeader>
            <CardTitle>Location</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-mono">{event.primary_location}</p>
          </CardContent>
        </Card>
      )}

      {/* Context (public narrative) */}
      <Card>
        <CardHeader>
          <CardTitle>Context</CardTitle>
          <CardDescription>
            Background, key parties, and competing claims. Shown to public users when present.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="context_background">Background</Label>
            <textarea
              id="context_background"
              value={contextBackground}
              onChange={(e) => setContextBackground(e.target.value)}
              placeholder="Background narrative…"
              rows={4}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="key_parties">Key parties</Label>
            <textarea
              id="key_parties"
              value={keyParties}
              onChange={(e) => setKeyParties(e.target.value)}
              placeholder="Key actors or coalitions…"
              rows={2}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="space-y-2">
            <Label>Competing claims</Label>
            {claims.map((c, idx) => (
              <div
                key={idx}
                className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3"
              >
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setClaims((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    Remove
                  </Button>
                </div>
                <input
                  placeholder="Claim"
                  value={c.claim}
                  onChange={(e) =>
                    setClaims((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, claim: e.target.value } : item
                      )
                    )
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <input
                  placeholder="Attributed to"
                  value={c.attributed_to}
                  onChange={(e) =>
                    setClaims((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, attributed_to: e.target.value } : item
                      )
                    )
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <input
                  placeholder="Confidence"
                  value={c.confidence}
                  onChange={(e) =>
                    setClaims((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, confidence: e.target.value } : item
                      )
                    )
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setClaims((prev) => [...prev, { claim: "", attributed_to: "", confidence: "" }])
              }
            >
              Add claim
            </Button>
          </div>
          {contextSaveError && (
            <p className="text-sm text-destructive">{contextSaveError}</p>
          )}
          {contextSaveSuccess && (
            <p className="text-sm text-green-600 dark:text-green-400">Context saved.</p>
          )}
          <Button
            onClick={handleSaveContext}
            disabled={contextSaveLoading}
          >
            {contextSaveLoading ? "Saving…" : "Save context"}
          </Button>
        </CardContent>
      </Card>

      {/* Context Analysis */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Context Analysis</CardTitle>
            {event.event_context?.status != null && (
              <span
                className={
                  event.event_context.status === "Approved"
                    ? "rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-200"
                    : event.event_context.status === "Rejected"
                      ? "rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-200"
                      : "rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                }
              >
                {event.event_context.status}
              </span>
            )}
          </div>
          <CardDescription>
            Summary, significance, likely driver, and uncertainty. Generate a draft, edit, then approve or reject.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="context_summary">Summary</Label>
            <textarea
              id="context_summary"
              value={contextSummary}
              onChange={(e) => setContextSummary(e.target.value)}
              placeholder="Concise restatement of what happened…"
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="context_why_it_matters">Why this matters</Label>
            <textarea
              id="context_why_it_matters"
              value={contextWhyItMatters}
              onChange={(e) => setContextWhyItMatters(e.target.value)}
              placeholder="Likely significance for regional stability or humanitarian impact…"
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="context_likely_driver">Likely driver</Label>
            <textarea
              id="context_likely_driver"
              value={contextLikelyDriver}
              onChange={(e) => setContextLikelyDriver(e.target.value)}
              placeholder="Conservative inferred driver from category and nearby events…"
              rows={2}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="context_uncertainty_note">Uncertainty note</Label>
            <textarea
              id="context_uncertainty_note"
              value={contextUncertaintyNote}
              onChange={(e) => setContextUncertaintyNote(e.target.value)}
              placeholder="Note on confidence and corroboration…"
              rows={2}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          {contextGenerateError && (
            <p className="text-sm text-destructive">{contextGenerateError}</p>
          )}
          {contextAnalysisSaveError && (
            <p className="text-sm text-destructive">{contextAnalysisSaveError}</p>
          )}
          {contextAnalysisSaveSuccess && (
            <p className="text-sm text-green-600 dark:text-green-400">Context analysis saved.</p>
          )}
          {contextActionError && (
            <p className="text-sm text-destructive">{contextActionError}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleGenerateContext}
              disabled={contextGenerateLoading}
            >
              {contextGenerateLoading ? "Generating…" : "Generate Draft"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveContextAnalysis}
              disabled={contextAnalysisSaveLoading || !event.event_context}
            >
              {contextAnalysisSaveLoading ? "Saving…" : "Save Edits"}
            </Button>
            <Button
              type="button"
              onClick={handleApproveContext}
              disabled={contextApproveLoading || !event.event_context}
            >
              {contextApproveLoading ? "Approving…" : "Approve Context"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleRejectContext}
              disabled={contextRejectLoading || !event.event_context}
            >
              {contextRejectLoading ? "Rejecting…" : "Reject Context"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Claims (event_claims) */}
      <Card>
        <CardHeader>
          <CardTitle>Claims</CardTitle>
          <CardDescription>
            Structured claims with actor, classification, confidence, and citation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(event.claim_conflicts ?? []).length > 0 && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-200">Conflicting claims detected</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-amber-700 dark:text-amber-300">
                {(event.claim_conflicts ?? []).map((cf) => (
                  <li key={cf.id}>{cf.reason}</li>
                ))}
              </ul>
            </div>
          )}
          {(event.event_claims ?? []).length >= 2 && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDetectContradictions}
                disabled={detectContradictionsLoading}
              >
                {detectContradictionsLoading ? "Detecting…" : "Detect contradictions"}
              </Button>
              {detectContradictionsError && (
                <p className="text-sm text-destructive">{detectContradictionsError}</p>
              )}
            </div>
          )}
          {/* Extract from source */}
          {sources.length > 0 && (
            <div className="space-y-2">
              <Label>Extract from source</Label>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={extractSourceId}
                  onChange={(e) => setExtractSourceId(e.target.value)}
                  className="flex h-9 min-w-[200px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Select source…</option>
                  {sources.filter((s) => s.id).map((s) => (
                    <option key={s.id!} value={s.id!}>
                      {s.source?.name ?? "Unknown"}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  onClick={handleExtractClaims}
                  disabled={extractClaimsLoading || !extractSourceId}
                >
                  {extractClaimsLoading ? "Extracting…" : "Extract claims"}
                </Button>
              </div>
              {extractClaimsError && (
                <p className="text-sm text-destructive">{extractClaimsError}</p>
              )}
            </div>
          )}

          {/* Suggested claims (candidates) */}
          {(event.event_claim_candidates ?? []).length > 0 && (
            <div className="space-y-2">
              <Label>Suggested claims</Label>
              <ul className="space-y-2">
                {(event.event_claim_candidates ?? []).map((c) => (
                  <li
                    key={c.id}
                    className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm"
                  >
                    <p>{c.claim_text}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {c.actor_name && <span className="text-muted-foreground">{c.actor_name}</span>}
                      <ConfidenceBadge level={c.confidence_level} />
                      <ClassificationBadge classification={c.classification} />
                      {c.source_name && (
                        <span className="text-muted-foreground text-xs">Source: {c.source_name}</span>
                      )}
                    </div>
                    {!c.evidence_source_url && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        Evidence URL missing — add below before approving.
                      </p>
                    )}
                    {!c.evidence_source_url && (
                      <input
                        placeholder="Evidence source URL (required to approve)"
                        value={approveUrlOverrides[c.id] ?? ""}
                        onChange={(e) =>
                          setApproveUrlOverrides((prev) => ({ ...prev, [c.id]: e.target.value }))
                        }
                        className="mt-1 flex h-8 w-full max-w-md rounded-md border border-input bg-transparent px-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="default"
                        onClick={() =>
                          handleApproveCandidate(
                            c.id,
                            c.evidence_source_url || approveUrlOverrides[c.id]
                          )
                        }
                        disabled={
                          candidateActionId !== null ||
                          (!c.evidence_source_url && !(approveUrlOverrides[c.id]?.trim()))
                        }
                      >
                        {candidateActionId === c.id ? "Approving…" : "Approve"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleRejectCandidate(c.id)}
                        disabled={candidateActionId !== null}
                      >
                        {candidateActionId === c.id ? "Rejecting…" : "Reject"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(event.event_claims ?? []).length > 0 ? (
            <ul className="space-y-2">
              {(event.event_claims ?? []).map((c) => (
                <li
                  key={c.id}
                  className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
                >
                  <p>{c.claim_text}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <ConfidenceBadge level={c.confidence_level} />
                    <ClassificationBadge classification={c.classification} />
                  </div>
                  <AttributionLine evidenceSourceUrl={c.evidence_source_url} className="mt-1" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No claims yet.</p>
          )}
          <div className="space-y-2">
            <Label>Add Claim</Label>
            <textarea
              placeholder="Claim text"
              value={addClaimForm.claim_text}
              onChange={(e) => setAddClaimForm((prev) => ({ ...prev, claim_text: e.target.value }))}
              rows={2}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <input
              placeholder="Actor name"
              value={addClaimForm.actor_name}
              onChange={(e) => setAddClaimForm((prev) => ({ ...prev, actor_name: e.target.value }))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <select
              value={addClaimForm.classification}
              onChange={(e) =>
                setAddClaimForm((prev) => ({
                  ...prev,
                  classification: e.target.value as "Verified Event" | "Disputed Claim",
                }))
              }
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="Verified Event">Verified Event</option>
              <option value="Disputed Claim">Disputed Claim</option>
            </select>
            <input
              placeholder="Confidence level"
              value={addClaimForm.confidence_level}
              onChange={(e) => setAddClaimForm((prev) => ({ ...prev, confidence_level: e.target.value }))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <input
              placeholder="Evidence source URL"
              value={addClaimForm.evidence_source_url}
              onChange={(e) => setAddClaimForm((prev) => ({ ...prev, evidence_source_url: e.target.value }))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {addClaimError && (
              <p className="text-sm text-destructive">{addClaimError}</p>
            )}
            <Button
              type="button"
              onClick={handleAddClaim}
              disabled={addClaimLoading}
            >
              {addClaimLoading ? "Adding…" : "Add Claim"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Facts (event_facts) */}
      <Card>
        <CardHeader>
          <CardTitle>Facts</CardTitle>
          <CardDescription>
            Verified or asserted facts with citation and confidence.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(event.event_facts ?? []).length > 0 ? (
            <ul className="space-y-2">
              {(event.event_facts ?? []).map((f) => (
                <li
                  key={f.id}
                  className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
                >
                  <p>{f.fact_text}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <ConfidenceBadge level={f.confidence_level} />
                  </div>
                  <AttributionLine evidenceSourceUrl={f.evidence_source_url} className="mt-1" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No facts yet.</p>
          )}
          <div className="space-y-2">
            <Label>Add Fact</Label>
            <textarea
              placeholder="Fact text"
              value={addFactForm.fact_text}
              onChange={(e) => setAddFactForm((prev) => ({ ...prev, fact_text: e.target.value }))}
              rows={2}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <input
              placeholder="Evidence source URL (optional)"
              value={addFactForm.evidence_source_url}
              onChange={(e) => setAddFactForm((prev) => ({ ...prev, evidence_source_url: e.target.value }))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <input
              placeholder="Confidence level (optional)"
              value={addFactForm.confidence_level}
              onChange={(e) => setAddFactForm((prev) => ({ ...prev, confidence_level: e.target.value }))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {addFactError && (
              <p className="text-sm text-destructive">{addFactError}</p>
            )}
            <Button
              type="button"
              onClick={handleAddFact}
              disabled={addFactLoading}
            >
              {addFactLoading ? "Adding…" : "Add Fact"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sources */}
      <Card>
        <CardHeader>
          <CardTitle>Sources</CardTitle>
          <CardDescription>Linked sources for this event</CardDescription>
        </CardHeader>
        <CardContent>
          {sources.length > 0 ? (
            <ul className="space-y-2">
              {sources.map((item) => {
                const name = item.source?.name ?? "Unknown source";
                const url = item.source?.url ?? item.claim_url ?? null;
                return (
                  <li
                    key={item.source_id}
                    className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{name}</span>
                    {url && (
                      <span className="ml-2">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {url}
                        </a>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No sources linked.</p>
          )}
        </CardContent>
      </Card>

      {/* Actors */}
      <Card>
        <CardHeader>
          <CardTitle>Actors</CardTitle>
          <CardDescription>Linked actors for this event</CardDescription>
        </CardHeader>
        <CardContent>
          {actors.length > 0 ? (
            <ul className="space-y-2">
              {actors.map((item, idx) => {
                const name = item.actor?.name ?? "Unknown actor";
                const affiliation = item.actor?.affiliation_label ?? null;
                const alignment = item.actor?.alignment ?? null;
                const parts = [name];
                if (affiliation) parts.push(`Affiliation: ${affiliation}`);
                if (alignment) parts.push(`Alignment: ${alignment}`);
                return (
                  <li
                    key={item.actor_id + String(idx)}
                    className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
                  >
                    {parts.join(" · ")}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No actors linked.</p>
          )}
        </CardContent>
      </Card>

      {/* Raw ingestion payload */}
      {ingestionItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Raw ingestion payload</CardTitle>
            <CardDescription>
              Original payload from ingestion for matching sources
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {ingestionItems.map((item, idx) => (
              <div
                key={item.source_url + String(idx)}
                className="rounded-md border border-border bg-muted/30 p-3"
              >
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {item.source_url}
                </p>
                <pre className="max-h-64 overflow-auto rounded bg-background p-2 text-xs">
                  {JSON.stringify(item.payload, null, 2)}
                </pre>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Confidence history */}
      <Card>
        <CardHeader>
          <CardTitle>Confidence history</CardTitle>
          <CardDescription>
            Changes to confidence score and tier for this event.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {confidenceLogLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
          {confidenceLogError && (
            <p className="text-sm text-destructive">{confidenceLogError}</p>
          )}
          {!confidenceLogLoading && !confidenceLogError && confidenceLog.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No confidence changes recorded.
            </p>
          )}
          {!confidenceLogLoading && !confidenceLogError && confidenceLog.length > 0 && (
            <ul className="space-y-3">
              {confidenceLog.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm"
                >
                  <p className="text-muted-foreground">
                    {formatDate(entry.changed_at)}
                    {entry.changed_field === "confidence_score"
                      ? ` · Score: ${entry.old_value ?? "—"} → ${entry.new_value}`
                      : ` · Tier: ${entry.old_value ?? "—"} → ${entry.new_value}`}
                  </p>
                  <p className="mt-1">{entry.justification}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
