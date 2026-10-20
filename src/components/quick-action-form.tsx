"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Calendar, Check, Info, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { localYmd } from "@/lib/format";
import { cn } from "@/lib/utils";

export function quickDialogClass(width: "md" | "lg" | "xl" | "wide" = "lg") {
  const widths = {
    md: "sm:max-w-md",
    lg: "sm:max-w-lg",
    xl: "sm:max-w-xl",
    wide: "sm:max-w-4xl",
  } as const;
  return cn(
    "flex max-h-[min(92dvh,52rem)] flex-col gap-0 overflow-hidden! p-0",
    widths[width],
  );
}

/**
 * Caps the scrolling form so a tall dialog keeps its header and footer on screen.
 * A max-height on the shell alone does not give the flex body a definite height.
 */
export const quickDialogBodyClass =
  "max-h-[calc(min(92dvh,52rem)-10rem)] min-h-0 overflow-y-auto overscroll-contain";

export const quickFieldClass = "h-10 rounded-lg bg-white";

const iconTones = {
  blue: "bg-sky-100 text-sky-700",
  rose: "bg-rose-100 text-rose-600",
  green: "bg-emerald-100 text-emerald-700",
  slate: "bg-neutral-100 text-neutral-500",
} as const;

export function QuickHeader({
  icon,
  tone,
  title,
  description,
  aside,
}: {
  icon: ReactNode;
  tone: keyof typeof iconTones;
  title: string;
  description?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-start gap-3 border-b px-5 py-4 pr-12">
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", iconTones[tone])}>
        {icon}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <DialogTitle className="font-heading text-[1.35rem] leading-none font-medium tracking-tight">
          {title}
        </DialogTitle>
        {description ? (
          <DialogDescription className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
            {description}
          </DialogDescription>
        ) : (
          <DialogDescription className="sr-only">{title}</DialogDescription>
        )}
      </div>
      {aside ? <div className="shrink-0 pt-0.5">{aside}</div> : null}
    </div>
  );
}

export function SyncBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
      <RefreshCw className="size-3.5" />
      Syncs to QuickBooks
    </span>
  );
}

export function QuickFooter({
  onCancel,
  pending,
  submitLabel,
  pendingLabel = "Saving…",
  note,
}: {
  onCancel: () => void;
  pending?: boolean;
  submitLabel: string;
  pendingLabel?: string;
  note?: ReactNode;
}) {
  return (
    <DialogFooter className="mx-0 mb-0 shrink-0 rounded-none border-t bg-muted/40 px-5 py-3 sm:justify-between">
      <div className="flex min-w-0 items-center text-xs text-muted-foreground">{note}</div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-lg bg-white px-4"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" className="h-9 rounded-lg px-4" disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </DialogFooter>
  );
}

export function QuickLabel({
  children,
  htmlFor,
  required,
  optional,
  aside,
}: {
  children: ReactNode;
  htmlFor?: string;
  required?: boolean;
  optional?: boolean;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <Label htmlFor={htmlFor} className="text-[13px] font-semibold text-foreground">
        {children}
        {required ? <span className="text-primary"> *</span> : null}
        {optional ? <span className="font-normal text-muted-foreground"> · optional</span> : null}
      </Label>
      {aside}
    </div>
  );
}

export function QuickHint({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{children}</p>;
}

export function QuickSection({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
      {children}
    </p>
  );
}

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2.5 text-sm text-sky-950">
      <Info className="mt-0.5 size-4 shrink-0 text-sky-600" />
      <p>{children}</p>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid rounded-lg bg-[#f3f2ef] p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-9 rounded-md px-2 text-sm font-medium transition-colors",
              on ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function ChoicePills<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border bg-white px-3 text-sm transition-colors",
              on
                ? "border-primary text-primary"
                : "border-border text-foreground hover:bg-muted/40",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function TogglePills<T extends string>({
  value,
  onToggle,
  options,
  label,
}: {
  value: readonly T[];
  onToggle: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(option.value)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border bg-white px-3 text-sm transition-colors",
              on
                ? "border-primary text-primary"
                : "border-border text-foreground hover:bg-muted/40",
            )}
          >
            {on ? <Check className="size-3.5" /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export type SearchOption = {
  value: string;
  label: string;
  hint?: string;
  group?: string;
};

export function RecordSearch({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  emptyText = "Nothing matches.",
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchOption[];
  placeholder: string;
  disabled?: boolean;
  emptyText?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      options
        .filter((option) => {
          if (!needle) return true;
          return `${option.label} ${option.hint ?? ""} ${option.group ?? ""}`
            .toLowerCase()
            .includes(needle);
        })
        .slice(0, 40),
    [needle, options],
  );
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, SearchOption[]>();
    for (const option of visible) {
      const group = option.group || "";
      if (!map.has(group)) {
        map.set(group, []);
        order.push(group);
      }
      map.get(group)?.push(option);
    }
    return order.map((group) => ({ group, options: map.get(group) ?? [] }));
  }, [visible]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (disabled) return;
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        disabled={disabled}
        aria-label={label}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-white px-3 text-left text-sm",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
          "disabled:cursor-not-allowed disabled:bg-muted/50 disabled:opacity-70",
          !selected && "text-muted-foreground",
        )}
      >
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{selected?.label || placeholder}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--anchor-width)] gap-0 p-0">
        <div className="border-b p-2">
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            aria-label={label}
            className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {visible.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">{emptyText}</p>
          ) : (
            groups.map((group) => (
              <div key={group.group || "all"}>
                {group.group ? (
                  <p className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {group.group}
                  </p>
                ) : null}
                {group.options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-muted/70"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className="text-sm">{option.label}</span>
                    {option.hint ? (
                      <span className="text-xs text-muted-foreground">{option.hint}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function DateField({
  id,
  value,
  onChange,
  display,
  label,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  display?: (value: string) => string;
  label: string;
}) {
  const text = value ? (display ? display(value) : value) : "Pick a date";
  return (
    <div className="relative">
      <div className="pointer-events-none flex h-10 items-center justify-between rounded-lg border border-input bg-white px-3 text-sm">
        <span>{text}</span>
        <Calendar className="size-4 text-muted-foreground" />
      </div>
      <input
        id={id}
        type="date"
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </div>
  );
}

export function TimeField({
  id,
  value,
  onChange,
  label,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="relative">
      <div className="pointer-events-none flex h-10 items-center rounded-lg border border-input bg-white px-3 text-sm">
        {formatClock(value)}
      </div>
      <input
        id={id}
        type="time"
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </div>
  );
}

export function formatWeekdayDate(ymd: string) {
  const date = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function formatClock(value: string) {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return value;
  const date = new Date();
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function formatDuration(start: string, end: string) {
  const toMinutes = (value: string) => {
    const match = /^(\d{2}):(\d{2})/.exec(value);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };
  const from = toMinutes(start);
  const to = toMinutes(end);
  if (from == null || to == null || to <= from) return "";
  const mins = to - from;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours && rem) return `${hours} hr ${rem} min`;
  if (hours === 1) return "1 hour";
  if (hours) return `${hours} hours`;
  return `${rem} min`;
}

export type DuePreset = "today" | "tomorrow" | "friday" | "next_week";

export function duePresetDate(preset: DuePreset, from = new Date()) {
  const date = new Date(from);
  date.setHours(12, 0, 0, 0);
  if (preset === "tomorrow") date.setDate(date.getDate() + 1);
  if (preset === "next_week") date.setDate(date.getDate() + 7);
  if (preset === "friday") {
    const add = (5 - date.getDay() + 7) % 7;
    date.setDate(date.getDate() + add);
  }
  return localYmd(date);
}

export function matchingDuePreset(ymd: string, from = new Date()): DuePreset | null {
  const order: DuePreset[] = ["today", "tomorrow", "friday", "next_week"];
  for (const preset of order) {
    if (duePresetDate(preset, from) === ymd) return preset;
  }
  return null;
}
