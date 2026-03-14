"use client";

import { cn } from "@/lib/utils";

type ConfidenceBadgeProps = {
  level: string | null | undefined;
  className?: string;
};

export function ConfidenceBadge({ level, className }: ConfidenceBadgeProps) {
  const normalized = level?.trim() || "";
  // Green = High, yellow = Medium, red = Low (source reliability & corroboration).
  const variant =
    normalized === "High"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
      : normalized === "Medium"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
        : normalized === "Low"
          ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
          : "bg-muted text-muted-foreground";
  const label = normalized === "High" || normalized === "Medium" || normalized === "Low" ? normalized : "Unknown";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        variant,
        className
      )}
    >
      {label}
    </span>
  );
}
