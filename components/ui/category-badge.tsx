"use client";

import { cn } from "@/lib/utils";
import { getCategoryColor } from "@/lib/mapMarkerStyle";

type CategoryBadgeProps = {
  category: string | null | undefined;
  className?: string;
};

/** Badge for event category (color matches map legend). */
export function CategoryBadge({ category, className }: CategoryBadgeProps) {
  const color = getCategoryColor(category);
  const label = category?.trim() || "Other";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        className
      )}
      style={{
        backgroundColor: `${color}20`,
        color: color,
      }}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}
