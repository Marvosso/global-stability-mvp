"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TIMELINE_WINDOW_OPTIONS,
  getTimelineWindowMs,
  type TimelineWindow,
} from "@/lib/timeline";

/** Playback: step position by this amount each tick. */
const PLAYBACK_STEP = 0.01;
/** Playback: interval between ticks (ms). ~15s for full 0→1. */
const PLAYBACK_INTERVAL_MS = 150;

type MapTimelineProps = {
  window: TimelineWindow;
  position: number;
  onWindowChange: (w: TimelineWindow) => void;
  /** Accepts a new value or updater (prev => next) for playback. */
  onPositionChange: (position: React.SetStateAction<number>) => void;
};

function formatPlayheadLabel(window: TimelineWindow, position: number): string {
  const now = Date.now();
  const windowMs = getTimelineWindowMs(window);
  const windowStart = now - windowMs;
  const playheadTime = windowStart + position * windowMs;
  const d = new Date(playheadTime);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MapTimeline({
  window,
  position,
  onWindowChange,
  onPositionChange,
}: MapTimelineProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isPlaying) return;
    intervalRef.current = setInterval(() => {
      onPositionChange((prev) => {
        const next = Math.min(1, prev + PLAYBACK_STEP);
        if (next >= 1 && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          setIsPlaying(false);
        }
        return next;
      });
    }, PLAYBACK_INTERVAL_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, onPositionChange]);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    } else {
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const num = Number.parseFloat(value);
      if (Number.isFinite(num)) onPositionChange(Math.min(1, Math.max(0, num)));
    },
    [onPositionChange]
  );

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-background/95 px-3 py-2 shadow backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Timeline
        </span>
        <div className="flex flex-wrap gap-0.5">
          {TIMELINE_WINDOW_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={window === opt.value ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onWindowChange(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handlePlayPause}
          disabled={position >= 1 && !isPlaying}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={position}
          onChange={handleSliderChange}
          className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          aria-label="Scrub timeline"
        />
        <span className="min-w-[8rem] text-right text-xs text-muted-foreground">
          Through {formatPlayheadLabel(window, position)}
        </span>
      </div>
    </div>
  );
}
