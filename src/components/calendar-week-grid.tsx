"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GoogleOverlayEvent } from "@/lib/google-calendar-demo";
import {
  EVENT_KIND_LABELS,
  type EventKind,
  type ScheduleEvent,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const HOUR_HEIGHT = 56;
const DAY_START_MIN = 6 * 60;
const DAY_END_MIN = 21 * 60;
const SNAP_MIN = 15;
const GRID_HEIGHT = ((DAY_END_MIN - DAY_START_MIN) / 60) * HOUR_HEIGHT;

const HOURS = Array.from(
  { length: (DAY_END_MIN - DAY_START_MIN) / 60 + 1 },
  (_, i) => DAY_START_MIN / 60 + i,
);

type Selection = {
  dayKey: string;
  startMin: number;
  endMin: number;
};

type Props = {
  days: Date[];
  crmEvents: ScheduleEvent[];
  googleEvents: GoogleOverlayEvent[];
  todayKey: string;
  onCreateEvent: (draft: {
    day: Date;
    start: string;
    end: string;
    title: string;
  }) => void;
  onEditEvent: (event: ScheduleEvent) => void;
  onQuickCreate: (input: {
    title: string;
    startsAt: string;
    endsAt: string;
    kind: EventKind;
  }) => void;
  onQuickDelete: (eventId: string) => void;
};

function dayKeyOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDayKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function minutesOf(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function snap(min: number) {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}

function yToMinutes(clientY: number, top: number) {
  const raw = ((clientY - top) / HOUR_HEIGHT) * 60 + DAY_START_MIN;
  return clamp(snap(raw), DAY_START_MIN, DAY_END_MIN);
}

function minutesToLabel(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function formatHourLabel(hour: number) {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function toTimeValue(totalMin: number) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function positionForRange(startsAt: string, endsAt: string) {
  const start = clamp(minutesOf(startsAt), DAY_START_MIN, DAY_END_MIN);
  const end = clamp(
    Math.max(minutesOf(endsAt), start + SNAP_MIN),
    DAY_START_MIN,
    DAY_END_MIN,
  );
  const top = ((start - DAY_START_MIN) / 60) * HOUR_HEIGHT;
  const height = Math.max(((end - start) / 60) * HOUR_HEIGHT, 22);
  return { top, height };
}

function calendarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 58% 42%)`;
}

export function CalendarWeekGrid({
  days,
  crmEvents,
  googleEvents,
  todayKey,
  onCreateEvent,
  onEditEvent,
  onQuickCreate,
  onQuickDelete,
}: Props) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dragging, setDragging] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickStart, setQuickStart] = useState("09:00");
  const [quickEnd, setQuickEnd] = useState("10:00");
  const [selectedCrmId, setSelectedCrmId] = useState<string | null>(null);
  const dragOrigin = useRef<{ dayKey: string; startMin: number } | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const crmByDay = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const event of crmEvents) {
      const key = dayKeyOf(new Date(event.startsAt));
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      );
    }
    return map;
  }, [crmEvents]);

  const googleByDay = useMemo(() => {
    const map = new Map<string, GoogleOverlayEvent[]>();
    for (const event of googleEvents) {
      const key = dayKeyOf(new Date(event.startsAt));
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return map;
  }, [googleEvents]);

  useEffect(() => {
    if (!dragging) return;

    function onMove(e: PointerEvent) {
      const origin = dragOrigin.current;
      if (!origin) return;
      const column = document.querySelector<HTMLElement>(
        `[data-day-column="${origin.dayKey}"]`,
      );
      if (!column) return;
      const rect = column.getBoundingClientRect();
      const current = yToMinutes(e.clientY, rect.top);
      const startMin = Math.min(origin.startMin, current);
      const endMin = Math.max(origin.startMin, current);
      setSelection({
        dayKey: origin.dayKey,
        startMin,
        endMin: endMin === startMin ? startMin + SNAP_MIN : endMin,
      });
    }

    function onUp() {
      setDragging(false);
      dragOrigin.current = null;
      setSelection((prev) => {
        if (!prev) return null;
        setQuickStart(toTimeValue(prev.startMin));
        setQuickEnd(
          toTimeValue(Math.max(prev.endMin, prev.startMin + SNAP_MIN)),
        );
        setQuickTitle("");
        setQuickOpen(true);
        return prev;
      });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging]);

  useEffect(() => {
    if (!quickOpen) return;
    const id = window.setTimeout(() => titleRef.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, [quickOpen]);

  useEffect(() => {
    if (!quickOpen && !selectedCrmId) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setQuickOpen(false);
        setSelection(null);
        setSelectedCrmId(null);
      }
    }

    function onDocPointer(e: PointerEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.("[data-event]")) return;
      if ((target as HTMLElement).closest?.("[data-day-column]")) return;
      setQuickOpen(false);
      setSelection(null);
      setSelectedCrmId(null);
    }

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDocPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDocPointer);
    };
  }, [quickOpen, selectedCrmId]);

  function beginDrag(dayKey: string, clientY: number, top: number) {
    const startMin = yToMinutes(clientY, top);
    dragOrigin.current = { dayKey, startMin };
    setSelectedCrmId(null);
    setSelection({
      dayKey,
      startMin,
      endMin: Math.min(startMin + 60, DAY_END_MIN),
    });
    setDragging(true);
  }

  function closeQuick() {
    setQuickOpen(false);
    setSelection(null);
    setQuickTitle("");
  }

  function saveQuick() {
    if (!selection || !quickTitle.trim()) return;
    const day = parseDayKey(selection.dayKey);
    const [sh, sm] = quickStart.split(":").map(Number);
    const [eh, em] = quickEnd.split(":").map(Number);
    const start = new Date(day);
    start.setHours(sh, sm, 0, 0);
    const end = new Date(day);
    end.setHours(eh, em, 0, 0);
    if (end <= start) {
      end.setTime(start.getTime() + 60 * 60 * 1000);
    }
    onQuickCreate({
      title: quickTitle.trim(),
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      kind: "meeting",
    });
    closeQuick();
  }

  function openFullEditor() {
    if (!selection) return;
    const day = parseDayKey(selection.dayKey);
    onCreateEvent({
      day,
      start: quickStart,
      end: quickEnd,
      title: quickTitle.trim(),
    });
    closeQuick();
  }

  const selectedCrm = crmEvents.find((e) => e.id === selectedCrmId) ?? null;
  const dayIndex = selection
    ? days.findIndex((d) => dayKeyOf(d) === selection.dayKey)
    : -1;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <div className="grid grid-cols-[4.5rem_repeat(7,minmax(0,1fr))] border-b border-border/70">
        <div className="border-r border-border/60 bg-muted/20" />
        {days.map((day) => {
          const key = dayKeyOf(day);
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              className={cn(
                "border-r border-border/60 px-2 py-3 text-center last:border-r-0",
                isToday && "bg-primary/5",
              )}
            >
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {day.toLocaleDateString(undefined, { weekday: "short" })}
              </p>
              <p
                className={cn(
                  "mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold tabular-nums",
                  isToday && "bg-primary text-primary-foreground",
                )}
              >
                {day.getDate()}
              </p>
            </div>
          );
        })}
      </div>

      <div className="max-h-[min(70vh,44rem)] overflow-auto">
        <div className="grid grid-cols-[4.5rem_repeat(7,minmax(0,1fr))]">
          <div className="relative border-r border-border/60 bg-muted/10">
            <div style={{ height: GRID_HEIGHT }} className="relative">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground"
                  style={{
                    top: ((hour * 60 - DAY_START_MIN) / 60) * HOUR_HEIGHT,
                  }}
                >
                  {formatHourLabel(hour)}
                </div>
              ))}
            </div>
          </div>

          {days.map((day) => {
            const key = dayKeyOf(day);
            const dayCrm = crmByDay.get(key) ?? [];
            const dayGoogle = googleByDay.get(key) ?? [];
            const isToday = key === todayKey;
            const sel =
              selection && selection.dayKey === key ? selection : null;

            return (
              <div
                key={key}
                data-day-column={key}
                className={cn(
                  "relative cursor-crosshair border-r border-border/60 last:border-r-0",
                  isToday && "bg-primary/[0.03]",
                )}
                style={{ height: GRID_HEIGHT }}
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).closest("[data-event]")) return;
                  if ((e.target as HTMLElement).closest("[data-quick-panel]"))
                    return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  beginDrag(key, e.clientY, rect.top);
                }}
              >
                {HOURS.slice(0, -1).map((hour) => (
                  <div
                    key={hour}
                    className="pointer-events-none absolute inset-x-0 border-t border-border/40"
                    style={{
                      top: ((hour * 60 - DAY_START_MIN) / 60) * HOUR_HEIGHT,
                      height: HOUR_HEIGHT,
                    }}
                  />
                ))}

                {dayGoogle.map((event) => {
                  const pos = positionForRange(event.startsAt, event.endsAt);
                  return (
                    <div
                      key={event.id}
                      data-event
                      className="absolute inset-x-1 z-[1] overflow-hidden rounded-md border border-dashed border-sky-400/50 bg-sky-500/10 px-1.5 py-1 text-[11px] text-sky-950 dark:text-sky-50"
                      style={{ top: pos.top, height: pos.height }}
                      title={`${event.title} · Google`}
                    >
                      <p className="truncate font-medium">{event.title}</p>
                      <p className="truncate opacity-70">
                        {event.allDay
                          ? "All day"
                          : `${formatTime(event.startsAt)} · Google`}
                      </p>
                    </div>
                  );
                })}

                {dayCrm.map((event) => {
                  const pos = positionForRange(event.startsAt, event.endsAt);
                  const color = calendarColor(event.assignee);
                  const active = selectedCrmId === event.id;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      data-event
                      className={cn(
                        "absolute inset-x-1 z-[2] overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] text-white shadow-sm transition",
                        active && "ring-2 ring-foreground/40 ring-offset-1",
                      )}
                      style={{
                        top: pos.top,
                        height: pos.height,
                        backgroundColor: color,
                        borderColor: "transparent",
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCrmId(event.id);
                        setQuickOpen(false);
                        setSelection(null);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onEditEvent(event);
                      }}
                    >
                      <p className="truncate font-semibold">{event.title}</p>
                      <p className="truncate opacity-90">
                        {formatTime(event.startsAt)} ·{" "}
                        {EVENT_KIND_LABELS[event.kind]}
                      </p>
                    </button>
                  );
                })}

                {sel ? (
                  <div
                    className="pointer-events-none absolute inset-x-1 z-[3] rounded-md border border-primary/50 bg-primary/15"
                    style={{
                      top:
                        ((sel.startMin - DAY_START_MIN) / 60) * HOUR_HEIGHT,
                      height: Math.max(
                        ((sel.endMin - sel.startMin) / 60) * HOUR_HEIGHT,
                        22,
                      ),
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {quickOpen && selection ? (
        <div
          ref={panelRef}
          data-quick-panel
          className="absolute z-20 w-[min(22rem,calc(100%-1.5rem))] rounded-xl border border-border bg-popover p-0 shadow-xl"
          style={{
            top: 88,
            left: `clamp(0.75rem, calc(4.5rem + ${(Math.max(dayIndex, 0) / 7) * 100}% * 0.86), calc(100% - 22.5rem))`,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2 border-b border-border/70 px-4 py-3">
            <div>
              <p className="font-medium">Add event</p>
              <p className="text-xs text-muted-foreground">
                {parseDayKey(selection.dayKey).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}{" "}
                · {minutesToLabel(selection.startMin)} –{" "}
                {minutesToLabel(selection.endMin)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              onClick={closeQuick}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="space-y-3 p-4">
            <Input
              ref={titleRef as never}
              placeholder="Add title"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveQuick();
                }
              }}
              className="h-10 text-base"
              autoFocus
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-xs text-muted-foreground">
                Start
                <Input
                  type="time"
                  value={quickStart}
                  onChange={(e) => setQuickStart(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                End
                <Input
                  type="time"
                  value={quickEnd}
                  onChange={(e) => setQuickEnd(e.target.value)}
                />
              </label>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={openFullEditor}
              >
                More options
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={closeQuick}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!quickTitle.trim()}
                  onClick={saveQuick}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {selectedCrm ? (
        <div
          ref={panelRef}
          data-quick-panel
          className="absolute top-20 right-4 z-20 w-[min(22rem,calc(100%-2rem))] overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            className="h-2"
            style={{ backgroundColor: calendarColor(selectedCrm.assignee) }}
          />
          <div className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-lg font-semibold leading-tight">
                  {selectedCrm.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {new Date(selectedCrm.startsAt).toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  – {formatTime(selectedCrm.endsAt)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close"
                onClick={() => setSelectedCrmId(null)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {EVENT_KIND_LABELS[selectedCrm.kind]} · {selectedCrm.assignee}
            </p>
            {selectedCrm.location ? (
              <p className="text-sm text-muted-foreground">
                {selectedCrm.location}
              </p>
            ) : null}
            {selectedCrm.notes ? (
              <p className="text-sm text-muted-foreground">{selectedCrm.notes}</p>
            ) : null}
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onEditEvent(selectedCrm);
                  setSelectedCrmId(null);
                }}
              >
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={() => {
                  onQuickDelete(selectedCrm.id);
                  setSelectedCrmId(null);
                }}
              >
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
