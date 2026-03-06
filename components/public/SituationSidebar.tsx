"use client";

import { useMemo } from "react";
import type { PublicEvent } from "@/lib/eventCoordinates";
import { getEventCoordinates } from "@/lib/eventCoordinates";
import { computeImportance } from "@/lib/scoring/importance";

const MAX_PER_SECTION = 8;

type SituationSidebarProps = {
  events: PublicEvent[];
  onEventClick: (event: PublicEvent) => void;
};

function eventSection(event: PublicEvent): "escalations" | "disasters" | "political" | null {
  if (event.category === "Natural Disaster") return "disasters";
  if (event.severity === "High" || event.severity === "Critical") return "escalations";
  const politicalCategories = [
    "Political Tension",
    "Diplomatic Confrontation",
    "Military Posture",
    "Coercive Economic Action",
    "Armed Conflict",
  ];
  if (politicalCategories.includes(event.category)) return "political";
  return null;
}

export function SituationSidebar({ events, onEventClick }: SituationSidebarProps) {
  const sections = useMemo(() => {
    const asOf = new Date();
    const withCoords = events.filter((e) => getEventCoordinates(e) !== null);
    const withImportance = withCoords.map((e) => ({
      event: e,
      importance: computeImportance(
        {
          severity: e.severity,
          confidence_level: e.confidence_level,
          occurred_at: e.occurred_at,
        },
        asOf
      ),
      section: eventSection(e),
    }));

    const bySection = {
      escalations: withImportance
        .filter((x) => x.section === "escalations")
        .sort((a, b) => b.importance - a.importance)
        .slice(0, MAX_PER_SECTION)
        .map((x) => x.event),
      disasters: withImportance
        .filter((x) => x.section === "disasters")
        .sort((a, b) => b.importance - a.importance)
        .slice(0, MAX_PER_SECTION)
        .map((x) => x.event),
      political: withImportance
        .filter((x) => x.section === "political")
        .sort((a, b) => b.importance - a.importance)
        .slice(0, MAX_PER_SECTION)
        .map((x) => x.event),
    };
    return bySection;
  }, [events]);

  const handleClick = (event: PublicEvent) => {
    onEventClick(event);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Situation
      </h2>

      <Section
        title="Escalations"
        events={sections.escalations}
        onEventClick={handleClick}
        emptyMessage="No high-severity escalations."
      />
      <Section
        title="Disasters"
        events={sections.disasters}
        onEventClick={handleClick}
        emptyMessage="No natural disasters."
      />
      <Section
        title="Political Unrest"
        events={sections.political}
        onEventClick={handleClick}
        emptyMessage="No political unrest events."
      />
    </div>
  );
}

function Section({
  title,
  events,
  onEventClick,
  emptyMessage,
}: {
  title: string;
  events: PublicEvent[];
  onEventClick: (event: PublicEvent) => void;
  emptyMessage: string;
}) {
  if (events.length === 0) {
    return (
      <div className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <ul className="space-y-0.5">
        {events.map((ev) => (
          <li key={ev.id}>
            <button
              type="button"
              className="w-full rounded-md bg-background px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors"
              onClick={() => onEventClick(ev)}
            >
              <div className="truncate font-medium">
                {ev.title?.trim() || "Untitled"}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {ev.country_code ?? "—"} · {ev.severity}
                {ev.category ? ` · ${ev.category}` : ""}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
