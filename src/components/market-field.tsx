"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { JOB_MARKET_LABELS, JOB_MARKETS, type JobMarket } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MarketField({
  value,
  onChange,
  id = "work-market",
}: {
  value: JobMarket;
  onChange: (market: JobMarket) => void;
  id?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Residential or commercial</Label>
      <div id={id} className="grid grid-cols-2 gap-2">
        {JOB_MARKETS.map((market) => (
          <Button
            key={market}
            type="button"
            variant={value === market ? "default" : "outline"}
            onClick={() => onChange(market)}
          >
            {JOB_MARKET_LABELS[market]}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {value === "residential"
          ? "Residential work is not taxed."
          : "Commercial proposals include sales tax."}
      </p>
    </div>
  );
}

export function MarketToggle({
  value,
  onChange,
  className,
}: {
  value: JobMarket;
  onChange: (market: JobMarket) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-1", className)}>
      {JOB_MARKETS.map((market) => (
        <Button
          key={market}
          type="button"
          size="sm"
          variant={value === market ? "default" : "outline"}
          onClick={() => onChange(market)}
        >
          {JOB_MARKET_LABELS[market]}
        </Button>
      ))}
    </div>
  );
}
