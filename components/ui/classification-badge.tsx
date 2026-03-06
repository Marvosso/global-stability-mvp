"use client";

import { cn } from "@/lib/utils";

type Classification = "Verified Event" | "Disputed Claim";

type ClassificationBadgeProps = {
  classification: Classification | string | null | undefined;
  className?: string;
};

export function ClassificationBadge({ classification, className }: ClassificationBadgeProps) {
  if (classification !== "Verified Event" && classification !== "Disputed Claim") {
    return null;
  }
  const variant =
    classification === "Verified Event"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
      : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        variant,
        className
      )}
    >
      {classification}
    </span>
  );
}
