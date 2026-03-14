"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CategoryBadge } from "@/components/ui/category-badge";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import type { PublicMapItem } from "@/lib/eventCoordinates";

type EventsInRegionPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  events: PublicMapItem[];
  error: string | null;
  onSelectEvent: (item: PublicMapItem) => void;
};

function formatDate(iso: string | null): string {
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

export function EventsInRegionPanel({
  open,
  onOpenChange,
  title,
  events,
  error,
  onSelectEvent,
}: EventsInRegionPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-base">Events in {title}</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {error && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 p-3">
              {error}
            </p>
          )}
          {!error && events.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Cluster detected but no detailed events published yet – check admin.
            </p>
          )}
          {!error && events.length > 0 && (
            <ul className="space-y-2">
              {events.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50"
                    onClick={() => onSelectEvent(item)}
                  >
                    <div className="font-medium text-sm truncate">
                      {item.title?.trim() || "Untitled"}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <CategoryBadge category={item.category} />
                      {item.subtype && <span>{item.subtype}</span>}
                      <span>{item.severity}</span>
                      <ConfidenceBadge level={item.confidence_level} />
                      <span>{formatDate(item.occurred_at)}</span>
                      {item.source_count != null && item.source_count > 0 && (
                        <span>{item.source_count} source(s)</span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
