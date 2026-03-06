"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { ClassificationBadge } from "@/components/ui/classification-badge";
import { AttributionLine } from "@/components/ui/attribution-line";
import type { PublicEvent, PublicMapItem } from "@/lib/eventCoordinates";

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type ScenarioOutcome = { name: string; probability: number };
type HistoricalExample = {
  event_id: string;
  title: string;
  outcome: string;
  occurred_at: string | null;
};
type ScenariosData = {
  possible_outcomes: ScenarioOutcome[];
  historical_examples: HistoricalExample[];
};

type ContextClaim = {
  id: string;
  claim_text: string;
  claim_type: string | null;
  actor_name: string | null;
  classification: string | null;
  evidence_source_url: string | null;
  confidence_level: string | null;
  created_at: string;
};
type ContextFact = {
  id: string;
  fact_text: string;
  evidence_source_url: string | null;
  confidence_level: string | null;
  created_at: string;
};
type EventContextData = {
  event_context: {
    one_paragraph_summary: string | null;
    background: string | null;
    trigger: string | null;
    updated_at: string;
  } | null;
  claims: ContextClaim[];
  facts: ContextFact[];
};

type IncidentSummary = {
  id: string;
  title: string | null;
  category: string | null;
  subtype: string | null;
  severity: string | null;
  confidence_level: string | null;
  primary_location: string | null;
  country_code: string | null;
  occurred_at: string | null;
};

type EventDetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: PublicEvent | null;
  /** When set, show incident header + source reports. */
  incident?: IncidentSummary | null;
  incidentEvents?: PublicEvent[] | null;
  eventsWithoutLocation?: PublicMapItem[];
  onSelectEvent?: (event: PublicEvent) => void;
  onSelectMapItem?: (item: PublicMapItem) => void;
  /** When set, show "Escalation" cluster list instead of event detail. */
  escalationCluster?: { region_key: string; event_count: number } | null;
  clusterEvents?: PublicEvent[];
};

export function EventDetailSheet({
  open,
  onOpenChange,
  event,
  incident = null,
  incidentEvents = [],
  eventsWithoutLocation = [],
  onSelectEvent,
  onSelectMapItem,
  escalationCluster = null,
  clusterEvents = [],
}: EventDetailSheetProps) {
  const [scenarios, setScenarios] = useState<ScenariosData | null>(null);
  const [scenariosLoading, setScenariosLoading] = useState(false);
  const [scenariosError, setScenariosError] = useState<string | null>(null);
  const [contextData, setContextData] = useState<EventContextData | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  useEffect(() => {
    if (!event?.id || !open) {
      setScenarios(null);
      setScenariosError(null);
      return;
    }
    let cancelled = false;
    setScenariosLoading(true);
    setScenariosError(null);
    fetch(`/api/public/events/${event.id}/scenarios`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load scenarios");
        return res.json();
      })
      .then((data: ScenariosData) => {
        if (!cancelled) setScenarios(data);
      })
      .catch((err) => {
        if (!cancelled)
          setScenariosError(err instanceof Error ? err.message : "Failed to load scenarios");
      })
      .finally(() => {
        if (!cancelled) setScenariosLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [event?.id, open]);

  useEffect(() => {
    if (!event?.id || !open) {
      setContextData(null);
      setContextError(null);
      return;
    }
    let cancelled = false;
    setContextLoading(true);
    setContextError(null);
    fetch(`/api/public/events/${event.id}/context`)
      .then((res) => {
        if (res.status === 404) {
          if (!cancelled) setContextData({ event_context: null, claims: [], facts: [] });
          return null;
        }
        if (!res.ok) throw new Error("Failed to load context");
        return res.json();
      })
      .then((data: EventContextData | null) => {
        if (!cancelled && data) setContextData(data);
      })
      .catch((err) => {
        if (!cancelled)
          setContextError(err instanceof Error ? err.message : "Failed to load context");
      })
      .finally(() => {
        if (!cancelled) setContextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [event?.id, open]);

  const showIncident = !event && incident && (incidentEvents?.length ?? 0) > 0;
  const showNoLocationList =
    !event && !showIncident && !escalationCluster && eventsWithoutLocation.length > 0 && onSelectMapItem;
  const showEscalationCluster =
    !event && !showIncident && escalationCluster && clusterEvents.length > 0 && onSelectEvent;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {event
              ? "Event details"
              : showIncident
                ? "Incident"
                : showEscalationCluster
                  ? `Escalation – ${escalationCluster.region_key}`
                  : "Events without location"}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto pt-4">
          {showIncident && incident && (
            <>
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle className="text-base">
                    {incident.title?.trim() || "Untitled"}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {incident.category}
                    {incident.subtype ? ` · ${incident.subtype}` : ""} · {incident.severity}
                    {incident.confidence_level ? ` · ${incident.confidence_level}` : ""}
                  </p>
                  {(incident.country_code || incident.occurred_at) && (
                    <p className="text-xs text-muted-foreground">
                      {[incident.country_code, incident.occurred_at ? formatDate(incident.occurred_at) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </CardHeader>
              </Card>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Source reports ({incidentEvents?.length ?? 0})
              </h4>
              <ul className="space-y-2">
                {(incidentEvents ?? []).map((ev) => (
                  <li key={ev.id}>
                    <Card
                      className="cursor-pointer transition-colors hover:bg-muted/50"
                      onClick={() => onSelectEvent?.(ev)}
                    >
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">
                          {ev.title?.trim() || "Untitled"}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {ev.category}
                          {ev.subtype ? ` · ${ev.subtype}` : ""} · {ev.severity}
                        </p>
                      </CardHeader>
                    </Card>
                  </li>
                ))}
              </ul>
            </>
          )}
          {showEscalationCluster && (
            <p className="mb-3 text-sm text-muted-foreground">
              {escalationCluster.event_count} events in this cluster. Click to view details.
            </p>
          )}
          {showEscalationCluster && (
            <ul className="space-y-2">
              {clusterEvents.map((ev) => (
                <li key={ev.id}>
                  <Card
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => onSelectEvent?.(ev)}
                  >
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">
                        {ev.title?.trim() || "Untitled"}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {ev.category}
                        {ev.subtype ? ` · ${ev.subtype}` : ""} · {ev.severity}
                      </p>
                    </CardHeader>
                  </Card>
                </li>
              ))}
            </ul>
          )}
          {showNoLocationList && (
            <ul className="space-y-2">
              {eventsWithoutLocation.map((item) => (
                <li key={item.id}>
                  <Card
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => onSelectMapItem?.(item)}
                  >
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">
                        {item.title?.trim() || "Untitled"}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {item.category}
                        {item.subtype ? ` · ${item.subtype}` : ""} · {item.severity}
                      </p>
                    </CardHeader>
                  </Card>
                </li>
              ))}
            </ul>
          )}
          {event && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {event.title?.trim() || "Untitled"}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {event.category}
                  {event.subtype ? ` · ${event.subtype}` : ""} · {event.severity}
                  {event.confidence_level
                    ? ` · ${event.confidence_level}`
                    : ""}
                </p>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>{event.summary?.trim() || "—"}</p>
                <p className="text-muted-foreground">
                  {event.occurred_at
                    ? formatDate(event.occurred_at)
                    : formatDate(event.created_at)}
                </p>
                {event.context_background?.trim() && (
                  <div className="space-y-1">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Background
                    </h4>
                    <p className="whitespace-pre-wrap">{event.context_background}</p>
                  </div>
                )}
                {event.key_parties?.trim() && (
                  <div className="space-y-1">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Key parties
                    </h4>
                    <p className="whitespace-pre-wrap">{event.key_parties}</p>
                  </div>
                )}
                {event.competing_claims && event.competing_claims.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Competing claims
                    </h4>
                    <ul className="space-y-2">
                      {event.competing_claims.map((c, idx) => (
                        <li
                          key={idx}
                          className="rounded-md border border-border bg-muted/30 px-3 py-2"
                        >
                          <p>{c.claim}</p>
                          {(c.attributed_to || c.confidence) && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {[c.attributed_to, c.confidence]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          {event && contextData && (contextData.facts.length > 0 || contextData.claims.length > 0) && (
            <div className="mt-4 space-y-3">
              {contextData.facts.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Facts
                  </h4>
                  <ul className="space-y-2">
                    {contextData.facts.map((f) => (
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
                </div>
              )}
              {contextData.claims.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Claims
                  </h4>
                  <ul className="space-y-2">
                    {contextData.claims.map((c) => (
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
                </div>
              )}
            </div>
          )}
          {event && contextLoading && (
            <p className="mt-4 text-sm text-muted-foreground">Loading context…</p>
          )}
          {event && contextError && (
            <p className="mt-4 text-sm text-destructive">{contextError}</p>
          )}
          {event && (
            <div className="mt-4 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Scenario Analysis
              </h3>
              {scenariosLoading && (
                <p className="text-sm text-muted-foreground">Loading…</p>
              )}
              {scenariosError && (
                <p className="text-sm text-destructive">{scenariosError}</p>
              )}
              {!scenariosLoading && !scenariosError && scenarios && (
                <Card>
                  <CardContent className="pt-4">
                    {scenarios.possible_outcomes.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No historical pattern data for this event type.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <p className="mb-2 text-xs font-medium text-muted-foreground">
                            Possible outcomes
                          </p>
                          <ul className="space-y-1.5">
                            {scenarios.possible_outcomes.map((o) => (
                              <li
                                key={o.name}
                                className="flex items-center justify-between text-sm"
                              >
                                <span>{o.name}</span>
                                <span className="text-muted-foreground">
                                  {Math.round(o.probability * 100)}%
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        {scenarios.historical_examples.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              Historical examples
                            </p>
                            <ul className="space-y-1.5 text-sm">
                              {scenarios.historical_examples.map((ex) => (
                                <li
                                  key={ex.event_id}
                                  className="rounded border border-border bg-muted/20 px-2 py-1.5"
                                >
                                  <p className="font-medium">
                                    {ex.title || "Untitled"}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {ex.outcome}
                                    {ex.occurred_at
                                      ? ` · ${formatDate(ex.occurred_at)}`
                                      : ""}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
