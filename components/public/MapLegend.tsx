"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

type MapLegendProps = {
  showEscalationRiskLayer?: boolean;
  onEscalationRiskLayerChange?: (show: boolean) => void;
};

export function MapLegend({
  showEscalationRiskLayer = false,
  onEscalationRiskLayerChange,
}: MapLegendProps) {
  return (
    <Card className="w-44 border-border/90 bg-background/95 shadow-md backdrop-blur sm:w-48">
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Events
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>Size = severity (Low → Critical). Opacity = confidence.</p>
          <p>Orange circle = escalation cluster. Click to see events.</p>
        </div>
        {onEscalationRiskLayerChange != null && (
          <div className="space-y-2 border-t border-border/80 pt-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Layers
            </Label>
            <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
              <Checkbox
                checked={showEscalationRiskLayer}
                onCheckedChange={(checked) =>
                  onEscalationRiskLayerChange(checked === true)
                }
              />
              <span>Escalation risk (by country)</span>
            </label>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
