"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { TRADE_LABELS, TRADES, parseTrades, tradeSummary, type Trade } from "@/lib/types";
import { cn } from "@/lib/utils";

export function toggleTrade(current: readonly string[], trade: Trade) {
  const selected = new Set(parseTrades(current));
  if (selected.has(trade)) selected.delete(trade);
  else selected.add(trade);
  return TRADES.filter((item) => selected.has(item));
}

export function TradesField({
  value,
  onChange,
  disabled,
  id = "trades-involved",
  hideLabel = false,
}: {
  value: readonly string[];
  onChange: (next: Trade[]) => void;
  disabled?: boolean;
  id?: string;
  hideLabel?: boolean;
}) {
  const selected = parseTrades(value);
  return (
    <div className="grid gap-1.5">
      {hideLabel ? null : <Label htmlFor={id}>Trades involved</Label>}
      <div id={id} className="flex flex-wrap gap-2">
        {TRADES.map((trade) => {
          const on = selected.includes(trade);
          return (
            <Button
              key={trade}
              type="button"
              size="sm"
              variant={on ? "default" : "outline"}
              disabled={disabled}
              aria-pressed={on}
              onClick={() => onChange(toggleTrade(selected, trade))}
            >
              {TRADE_LABELS[trade]}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function TradesMenu({
  value,
  onChange,
  disabled,
  className,
}: {
  value: readonly string[];
  onChange: (next: Trade[]) => void;
  disabled?: boolean;
  className?: string;
}) {
  const selected = parseTrades(value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label="Trades involved"
            className={cn(
              "h-7 w-auto max-w-56 gap-1 rounded-full border bg-background px-2.5 text-xs font-medium shadow-none",
              !selected.length && "text-muted-foreground",
              className,
            )}
          />
        }
      >
        <span className="truncate">{tradeSummary(selected)}</span>
        <ChevronDown className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Trades involved</DropdownMenuLabel>
          {TRADES.map((trade) => (
            <DropdownMenuCheckboxItem
              key={trade}
              checked={selected.includes(trade)}
              closeOnClick={false}
              onCheckedChange={() => onChange(toggleTrade(selected, trade))}
            >
              {TRADE_LABELS[trade]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
