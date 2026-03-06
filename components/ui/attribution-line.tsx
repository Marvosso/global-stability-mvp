"use client";

import { cn } from "@/lib/utils";

type AttributionLineProps = {
  evidenceSourceUrl: string | null | undefined;
  label?: string;
  className?: string;
};

export function AttributionLine({
  evidenceSourceUrl,
  label = "Source",
  className,
}: AttributionLineProps) {
  const hasUrl = Boolean(evidenceSourceUrl?.trim());
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      <span className="font-medium">{label}:</span>{" "}
      {hasUrl ? (
        <a
          href={evidenceSourceUrl!}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          {evidenceSourceUrl}
        </a>
      ) : (
        <span>No source</span>
      )}
    </p>
  );
}
