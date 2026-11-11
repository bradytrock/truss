"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Fence, House, PaintRoller, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverClose, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import {
  TRADE_LABELS,
  TRADE_MENU_ORDER,
  TRADES,
  cleanOtherTradeName,
  parseTrades,
  tradeLabel,
  type Trade,
} from "@/lib/types";
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

const MENU_TRADES = TRADE_MENU_ORDER.filter((trade) => trade !== "other");

function sameTrades(a: readonly Trade[], b: readonly Trade[]) {
  return a.length === b.length && a.every((trade, index) => trade === b[index]);
}

function TradeMark({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-[4px] border",
        checked
          ? "border-primary bg-primary text-white"
          : "border-[#c8c8c8] bg-white dark:border-input dark:bg-transparent",
      )}
    >
      {checked ? <Check className="size-3" strokeWidth={3} /> : null}
    </span>
  );
}

function TradeGlyph({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function TradeIcon({ trade }: { trade: Trade }) {
  const className = "size-4 shrink-0";
  if (trade === "roofing") return <House className={className} strokeWidth={1.8} />;
  if (trade === "gutters") {
    return (
      <TradeGlyph>
        <path d="M3 8.5h12" />
        <path d="M3 8.5v2.4" />
        <path d="M15 8.5c2.4 0 3.4 1.3 3.4 2.8V18" />
        <path d="M15.2 18h5.6" />
      </TradeGlyph>
    );
  }
  if (trade === "siding") {
    return (
      <TradeGlyph>
        <rect x="4" y="4.2" width="16" height="3.5" rx="0.6" />
        <rect x="4" y="10.25" width="16" height="3.5" rx="0.6" />
        <rect x="4" y="16.3" width="16" height="3.5" rx="0.6" />
      </TradeGlyph>
    );
  }
  if (trade === "fencing") return <Fence className={className} strokeWidth={1.8} />;
  if (trade === "flooring") return <PaintRoller className={className} strokeWidth={1.8} />;
  return <Plus className={className} strokeWidth={2} />;
}

export function TradesMenu({
  value,
  onChange,
  otherName = "",
  disabled,
  className,
  emptyLabel = "Trades involved",
  separator = ", ",
}: {
  value: readonly string[];
  onChange: (next: Trade[], otherName: string) => void | boolean | Promise<void | boolean>;
  otherName?: string;
  disabled?: boolean;
  className?: string;
  emptyLabel?: string;
  separator?: string;
}) {
  const savedTrades = parseTrades(value);
  const savedName = cleanOtherTradeName(otherName);
  const savedKey = `${savedTrades.join("\0")}\n${savedName}`;
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<Trade[]>(savedTrades);
  const [draftName, setDraftName] = useState(otherName);
  const selectionRef = useRef<Trade[]>(savedTrades);
  const nameRef = useRef(savedName);
  const savedRef = useRef({ trades: savedTrades, name: savedName });
  const lastSent = useRef({ trades: savedTrades, name: savedName });
  const chain = useRef(Promise.resolve());
  const nameFocused = useRef(false);
  const draftRef = useRef(otherName);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
    draftRef.current = draftName;
  });

  useEffect(() => {
    const trades = parseTrades(value);
    const name = cleanOtherTradeName(otherName);
    if (!sameTrades(trades, selectionRef.current) || name !== nameRef.current) return;
    savedRef.current = { trades, name };
    lastSent.current = { trades, name };
    if (!nameFocused.current && draftRef.current !== otherName) setDraftName(otherName);
  }, [savedKey, otherName, value]);

  useEffect(() => {
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, []);

  function cancelDebounce() {
    if (!debounce.current) return;
    clearTimeout(debounce.current);
    debounce.current = null;
  }

  function commit(nextTrades: readonly string[], nextName: string) {
    cancelDebounce();
    const trades = parseTrades(nextTrades);
    const name = trades.includes("other") ? cleanOtherTradeName(nextName) : "";
    if (sameTrades(trades, selectionRef.current) && name === nameRef.current) return;
    selectionRef.current = trades;
    nameRef.current = name;
    setSelection(trades);
    chain.current = chain.current
      .then(async () => {
        const tradesNow = selectionRef.current;
        const nameNow = nameRef.current;
        if (sameTrades(tradesNow, lastSent.current.trades) && nameNow === lastSent.current.name) return;
        const sent = { trades: tradesNow, name: nameNow };
        lastSent.current = sent;
        let ok = true;
        try {
          ok = (await onChangeRef.current(sent.trades, sent.name)) !== false;
        } catch {
          ok = false;
        }
        const stillCurrent = sameTrades(selectionRef.current, sent.trades) && nameRef.current === sent.name;
        if (!ok && stillCurrent) {
          selectionRef.current = savedRef.current.trades;
          nameRef.current = savedRef.current.name;
          lastSent.current = savedRef.current;
          setSelection(savedRef.current.trades);
          setDraftName(savedRef.current.name);
          draftRef.current = savedRef.current.name;
          return;
        }
        if (ok && stillCurrent) savedRef.current = sent;
      })
      .catch(() => undefined);
  }

  function toggle(trade: Trade) {
    const next = toggleTrade(selectionRef.current, trade);
    if (!next.includes("other")) {
      setDraftName("");
      draftRef.current = "";
    }
    commit(next, draftRef.current);
  }

  function onNameInput(value: string) {
    setDraftName(value);
    draftRef.current = value;
    const next =
      value.trim() && !selectionRef.current.includes("other")
        ? toggleTrade(selectionRef.current, "other")
        : selectionRef.current;
    if (!sameTrades(next, selectionRef.current)) {
      selectionRef.current = next;
      setSelection(next);
    }
    cancelDebounce();
    debounce.current = setTimeout(() => {
      debounce.current = null;
      commit(selectionRef.current, draftRef.current);
    }, 400);
  }

  function clear() {
    setDraftName("");
    draftRef.current = "";
    commit([], "");
  }

  const summary = TRADE_MENU_ORDER.filter((trade) => selection.includes(trade))
    .map((trade) => tradeLabel(trade, trade === "other" ? draftName : ""))
    .join(separator);
  const countLabel = `${selection.length} selected`;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) commit(selectionRef.current, draftRef.current);
        setOpen(next);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label="Trades on this job"
            className={cn(
              "h-7 w-auto max-w-72 gap-1 rounded-full border bg-card px-2.5 text-xs font-medium shadow-none",
              !selection.length && "text-muted-foreground",
              className,
            )}
          />
        }
      >
        {selection.length === 0 ? <Plus className="size-3" /> : null}
        <span className="truncate">{selection.length === 0 ? emptyLabel : summary}</span>
        <ChevronDown className="size-3 opacity-60" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[min(22rem,calc(100vw-1.5rem))] gap-0 overflow-hidden rounded-[16px] p-0 shadow-lg ring-black/5"
      >
        <div className="flex items-center justify-between gap-3 px-3.5 pt-3 pb-1.5">
          <PopoverTitle className="text-[15px] font-semibold tracking-tight">Trades on this job</PopoverTitle>
          <p className="shrink-0 text-sm text-[#8a8a8a]">{countLabel}</p>
        </div>
        <div className="flex flex-col gap-0.5 px-1.5 pb-1">
          {MENU_TRADES.map((trade) => {
            const on = selection.includes(trade);
            return (
              <button
                key={trade}
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={disabled}
                onClick={() => toggle(trade)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[8px] px-2 py-2 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  on ? "bg-[#fdecec] text-foreground dark:bg-primary/15" : "hover:bg-muted/70",
                )}
              >
                <TradeMark checked={on} />
                <TradeIcon trade={trade} />
                {TRADE_LABELS[trade]}
              </button>
            );
          })}
        </div>
        <div className="mx-3 border-t" />
        <div
          className={cn(
            "mx-1.5 mt-1 mb-1.5 flex items-center gap-2.5 rounded-lg px-2 py-1.5",
            selection.includes("other") ? "bg-[#fdecec] dark:bg-primary/15" : "",
          )}
        >
          <button
            type="button"
            role="checkbox"
            aria-checked={selection.includes("other")}
            disabled={disabled}
            onClick={() => toggle("other")}
            className="flex min-w-0 flex-1 items-center gap-2.5 py-0.5 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <TradeMark checked={selection.includes("other")} />
            <TradeIcon trade="other" />
            Other
          </button>
          <input
            value={draftName}
            disabled={disabled}
            maxLength={48}
            placeholder="Name it"
            aria-label="Name the other trade"
            onFocus={() => {
              nameFocused.current = true;
            }}
            onBlur={() => {
              nameFocused.current = false;
              commit(selectionRef.current, draftRef.current);
            }}
            onChange={(event) => onNameInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit(selectionRef.current, draftRef.current);
              }
            }}
            className="w-28 shrink-0 bg-transparent text-right text-sm font-normal text-foreground outline-none placeholder:text-[#b0b0b0] disabled:opacity-50"
          />
        </div>
        <div className="flex items-center justify-between border-t bg-[#f6f6f6] px-3 py-2.5 dark:bg-muted/40">
          <button
            type="button"
            className="px-1 text-sm font-medium text-foreground hover:text-foreground/70"
            onClick={clear}
          >
            Clear
          </button>
          <PopoverClose
            type="button"
            className="inline-flex h-8 items-center rounded-[8px] bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-sm outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            Done
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
}
