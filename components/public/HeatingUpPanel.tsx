"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HeatingUpEventLike } from "@/lib/heatingUpSummaries";
import {
  topCategories,
  topRegions,
  risingCategories,
  risingRegions,
} from "@/lib/heatingUpSummaries";

type HeatingUpPanelProps = {
  events: HeatingUpEventLike[];
};

function Section({
  title,
  items,
  emptyMessage,
  format,
}: {
  title: string;
  items: { label: string; count?: number; delta?: number }[];
  emptyMessage: string;
  format: (item: { label: string; count?: number; delta?: number }) => string;
}) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li
              key={item.label}
              className="flex justify-between gap-2 text-xs"
            >
              <span className="truncate">{item.label}</span>
              <span className="shrink-0 text-muted-foreground">
                {format(item)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function HeatingUpPanel({ events }: HeatingUpPanelProps) {
  const summaries = useMemo(() => {
    const now = Date.now();
    return {
      topCat24: topCategories(events, now, "24h"),
      topCat7d: topCategories(events, now, "7d"),
      topReg7d: topRegions(events, now, "7d"),
      risingCat: risingCategories(events, now),
      risingReg: risingRegions(events, now),
    };
  }, [events]);

  return (
    <Card className="w-52 border-border/90 bg-background/95 shadow-md backdrop-blur sm:w-56">
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          What&apos;s heating up
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <Section
          title="Top categories (24h)"
          items={summaries.topCat24}
          emptyMessage="No events in last 24h"
          format={(item) => String(item.count)}
        />
        <Section
          title="Top categories (7d)"
          items={summaries.topCat7d}
          emptyMessage="No events in last 7d"
          format={(item) => String(item.count)}
        />
        <Section
          title="Top regions (7d)"
          items={summaries.topReg7d}
          emptyMessage="No regions"
          format={(item) => String(item.count)}
        />
        <Section
          title="Rising categories (24h)"
          items={summaries.risingCat}
          emptyMessage="No rising categories"
          format={(item) => `+${item.delta}`}
        />
        <Section
          title="Rising regions (24h)"
          items={summaries.risingReg}
          emptyMessage="No rising regions"
          format={(item) => `+${item.delta}`}
        />
      </CardContent>
    </Card>
  );
}
