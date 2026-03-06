"use client";

import { cn } from "@/lib/utils";

type ConfidenceBadgeProps = {
  level: string | null | undefined;
  className?: string;
};

export function ConfidenceBadge({ level, className }: ConfidenceBadgeProps) {
  const normalized = level?.trim() || "";
  const variant =
    normalized === "High"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
      : normalized === "Medium"
        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
        : normalized === "Low"
          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
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
