"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { event_category, confidence_level } from "@/app/api/_lib/enums";
import {
  type MapFiltersState,
  DEFAULT_MAP_FILTERS,
  countActiveFilters,
} from "@/lib/mapFilters";

type MapFiltersProps = {
  value: MapFiltersState;
  onChange: (f: MapFiltersState) => void;
};

const SEVERITY_OPTIONS = [
  { value: "1", label: "1 Low" },
  { value: "2", label: "2 Medium" },
  { value: "3", label: "3 High" },
  { value: "4", label: "4 Critical" },
  { value: "5", label: "5 All" },
] as const;

const TIME_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "24h", label: "Last 24 hours" },
  { value: "72h", label: "Last 72 hours" },
  { value: "7d", label: "Last 7 days" },
] as const;

export function MapFilters({ value, onChange }: MapFiltersProps) {
  const toggleCategory = (category: string) => {
    const next = value.categories.includes(category)
      ? value.categories.filter((c) => c !== category)
      : [...value.categories, category];
    onChange({ ...value, categories: next });
  };

  const toggleConfidence = (level: string) => {
    const next = value.confidenceLevels.includes(level)
      ? value.confidenceLevels.filter((c) => c !== level)
      : [...value.confidenceLevels, level];
    onChange({ ...value, confidenceLevels: next });
  };

  const activeCount = countActiveFilters(value);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs">
          Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">
              Category
            </Label>
            <div className="flex max-h-32 flex-col gap-1 overflow-y-auto">
              {event_category.map((cat) => {
                const selected = value.categories.includes(cat);
                return (
                  <Button
                    key={cat}
                    type="button"
                    variant={selected ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 justify-start text-left text-xs"
                    onClick={() => toggleCategory(cat)}
                  >
                    {cat}
                  </Button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {value.categories.length === 0
                ? "All categories"
                : `${value.categories.length} selected`}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">
              Confidence
            </Label>
            <div className="flex max-h-24 flex-col gap-1 overflow-y-auto">
              {confidence_level.map((level) => {
                const selected = value.confidenceLevels.includes(level);
                return (
                  <Button
                    key={level}
                    type="button"
                    variant={selected ? "secondary" : "ghost"}
                    size="sm"
                    className="h-8 justify-start text-left text-xs"
                    onClick={() => toggleConfidence(level)}
                  >
                    {level}
                  </Button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {value.confidenceLevels.length === 0
                ? "All confidence levels"
                : `${value.confidenceLevels.length} selected`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label
                htmlFor="filter-severity-min"
                className="text-xs font-semibold uppercase text-muted-foreground"
              >
                Severity min
              </Label>
              <Select
                value={String(value.severityMin)}
                onValueChange={(v) =>
                  onChange({ ...value, severityMin: Number(v) })
                }
              >
                <SelectTrigger id="filter-severity-min" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="filter-severity-max"
                className="text-xs font-semibold uppercase text-muted-foreground"
              >
                Severity max
              </Label>
              <Select
                value={String(value.severityMax)}
                onValueChange={(v) =>
                  onChange({ ...value, severityMax: Number(v) })
                }
              >
                <SelectTrigger id="filter-severity-max" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="filter-time"
              className="text-xs font-semibold uppercase text-muted-foreground"
            >
              Time
            </Label>
            <Select
              value={value.timeWindow ?? "any"}
              onValueChange={(v) =>
                onChange({
                  ...value,
                  timeWindow: v === "any" ? null : (v as "24h" | "72h" | "7d"),
                })
              }
            >
              <SelectTrigger id="filter-time" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-full text-xs"
            onClick={() => onChange(DEFAULT_MAP_FILTERS)}
          >
            Reset filters
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
