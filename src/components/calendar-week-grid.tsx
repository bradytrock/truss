"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GoogleOverlayEvent } from "@/lib/google-calendar-demo";
import {
  applyMinutesToDay,
  columnStyle,
  DAY_END_MIN,
  DAY_START_MIN,
  dayKeyOf,
  DRAG_THRESHOLD_PX,
  formatHourLabel,
  GRID_HEIGHT,
  HOUR_HEIGHT,
  layoutOverlaps,
  minutesToLabel,
  nowMinutes,
  parseDayKey,
  SNAP_MIN,
  toTimeValue,
  yToMinutes,
} from "@/lib/calendar-layout";
import {
  EVENT_KIND_LABELS,
  type EventKind,
  type ScheduleEvent,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const HOURS = Array.from(
  { length: (DAY_END_MIN - DAY_START_MIN) / 60 + 1 },
  (_, i) => DAY_START_MIN / 60 + i,
);

type Selection = {
  dayKey: string;
  startMin: number;
  endMin: number;
};

type MoveState = {
  eventId: string;
  dayKey: string;
  durationMin: number;
  startMin: number;
  originClientY: number;
  moved: boolean;
};

type ResizeState = {
  eventId: string;
  dayKey: string;
  startMin: number;
  endMin: number;
  moved: boolean;
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
  onReschedule: (input: {
    eventId: string;
    startsAt: string;
    endsAt: string;
  }) => void;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function calendarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return `hsl(${Math.abs(hash) % 360} 58% 42%)`;
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
  onReschedule,
}: Props) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [draggingCreate, setDraggingCreate] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickStart, setQuickStart] = useState("09:00");
  const [quickEnd, setQuickEnd] = useState("10:00");
  const [selectedCrmId, setSelectedCrmId] = useState<string | null>(null);
  const [movePreview, setMovePreview] = useState<MoveState | null>(null);
  const [resizePreview, setResizePreview] = useState<ResizeState | null>(null);
  const [nowMin, setNowMin] = useState(() => nowMinutes());

  const dragOrigin = useRef<{
    dayKey: string;
    startMin: number;
    clientY: number;
    activated: boolean;
  } | null>(null);
  const moveRef = useRef<MoveState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const didScrollToNow = useRef(false);

  const dayCount = Math.max(days.length, 1);
  const isDayView = dayCount === 1;

  const laidOutCrm = useMemo(() => {
    const map = new Map<string, ReturnType<typeof layoutOverlaps<ScheduleEvent>>>();
    const byDay = new Map<string, ScheduleEvent[]>();
    for (const event of crmEvents) {
      const key = dayKeyOf(new Date(event.startsAt));
      const list = byDay.get(key) ?? [];
      list.push(event);
      byDay.set(key, list);
    }
    for (const [key, list] of byDay) {
      map.set(key, layoutOverlaps(list));
    }
    return map;
  }, [crmEvents]);

  const laidOutGoogle = useMemo(() => {
    const map = new Map<string, ReturnType<typeof layoutOverlaps<GoogleOverlayEvent>>>();
    const byDay = new Map<string, GoogleOverlayEvent[]>();
    for (const event of googleEvents) {
      const key = dayKeyOf(new Date(event.startsAt));
      const list = byDay.get(key) ?? [];
      list.push(event);
      byDay.set(key, list);
    }
    for (const [key, list] of byDay) {
      map.set(key, layoutOverlaps(list));
    }
    return map;
  }, [googleEvents]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMin(nowMinutes()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (didScrollToNow.current || !scrollRef.current) return;
    if (nowMin < DAY_START_MIN || nowMin > DAY_END_MIN) return;
    scrollRef.current.scrollTop = Math.max(
      0,
      ((nowMin - DAY_START_MIN) / 60) * HOUR_HEIGHT - 120,
    );
    didScrollToNow.current = true;
  }, [nowMin]);

  useEffect(() => {
    if (!draggingCreate) return;

    function onMove(e: PointerEvent) {
      const origin = dragOrigin.current;
      if (!origin) return;
      if (!origin.activated) {
        if (Math.abs(e.clientY - origin.clientY) < DRAG_THRESHOLD_PX) return;
        origin.activated = true;
      }
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
      const origin = dragOrigin.current;
      setDraggingCreate(false);
      dragOrigin.current = null;
      setSelection((prev) => {
        const base =
          prev ??
          (origin
            ? {
                dayKey: origin.dayKey,
                startMin: origin.startMin,
                endMin: Math.min(origin.startMin + 60, DAY_END_MIN),
              }
            : null);
        if (!base) return null;
        setQuickStart(toTimeValue(base.startMin));
        setQuickEnd(toTimeValue(Math.max(base.endMin, base.startMin + SNAP_MIN)));
        setQuickTitle("");
        setQuickOpen(true);
        return base;
      });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [draggingCreate]);

  useEffect(() => {
    if (!movePreview && !resizePreview) return;

    function onMove(e: PointerEvent) {
      const moving = moveRef.current;
      if (moving) {
        const columns = Array.from(
          document.querySelectorAll<HTMLElement>("[data-day-column]"),
        );
        for (const column of columns) {
          const rect = column.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right) {
            const dayKey = column.dataset.dayColumn ?? moving.dayKey;
            const startMin = yToMinutes(e.clientY, rect.top);
            const next: MoveState = {
              ...moving,
              dayKey,
              startMin,
              moved:
                moving.moved ||
                Math.abs(e.clientY - moving.originClientY) > DRAG_THRESHOLD_PX ||
                dayKey !== moving.dayKey,
            };
            moveRef.current = next;
            setMovePreview(next);
            return;
          }
        }
        return;
      }

      const resizing = resizeRef.current;
      if (!resizing) return;
      const column = document.querySelector<HTMLElement>(
        `[data-day-column="${resizing.dayKey}"]`,
      );
      if (!column) return;
      const rect = column.getBoundingClientRect();
      const endMin = Math.max(yToMinutes(e.clientY, rect.top), resizing.startMin + SNAP_MIN);
      const next: ResizeState = { ...resizing, endMin, moved: true };
      resizeRef.current = next;
      setResizePreview(next);
    }

    function onUp() {
      const moving = moveRef.current;
      if (moving) {
        moveRef.current = null;
        setMovePreview(null);
        if (moving.moved) {
          const start = applyMinutesToDay(moving.dayKey, moving.startMin);
          const end = new Date(start);
          end.setMinutes(end.getMinutes() + moving.durationMin);
          onReschedule({
            eventId: moving.eventId,
            startsAt: start.toISOString(),
            endsAt: end.toISOString(),
          });
        } else {
          setSelectedCrmId(moving.eventId);
          setQuickOpen(false);
          setSelection(null);
        }
        return;
      }

      const resizing = resizeRef.current;
      if (resizing) {
        resizeRef.current = null;
        setResizePreview(null);
        if (resizing.moved) {
          onReschedule({
            eventId: resizing.eventId,
            startsAt: applyMinutesToDay(resizing.dayKey, resizing.startMin).toISOString(),
            endsAt: applyMinutesToDay(resizing.dayKey, resizing.endMin).toISOString(),
          });
        }
      }
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [movePreview, onReschedule, resizePreview]);

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

  function beginCreate(dayKey: string, clientY: number, top: number) {
    const startMin = yToMinutes(clientY, top);
    dragOrigin.current = { dayKey, startMin, clientY, activated: false };
    setSelectedCrmId(null);
    setSelection({
      dayKey,
      startMin,
      endMin: Math.min(startMin + 60, DAY_END_MIN),
    });
    setDraggingCreate(true);
  }

  function beginMove(event: ScheduleEvent, clientY: number) {
    const dayKey = dayKeyOf(new Date(event.startsAt));
    const start = new Date(event.startsAt);
    const end = new Date(event.endsAt);
    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = Math.max(end.getHours() * 60 + end.getMinutes(), startMin + SNAP_MIN);
    const state: MoveState = {
      eventId: event.id,
      dayKey,
      durationMin: endMin - startMin,
      startMin,
      originClientY: clientY,
      moved: false,
    };
    moveRef.current = state;
    setMovePreview(state);
    setSelectedCrmId(null);
    setQuickOpen(false);
    setSelection(null);
  }

  function beginResize(event: ScheduleEvent) {
    const dayKey = dayKeyOf(new Date(event.startsAt));
    const start = new Date(event.startsAt);
    const end = new Date(event.endsAt);
    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = Math.max(end.getHours() * 60 + end.getMinutes(), startMin + SNAP_MIN);
    const state: ResizeState = {
      eventId: event.id,
      dayKey,
      startMin,
      endMin,
      moved: false,
    };
    resizeRef.current = state;
    setResizePreview(state);
    setSelectedCrmId(null);
    setQuickOpen(false);
    setSelection(null);
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
    if (end <= start) end.setTime(start.getTime() + 60 * 60 * 1000);
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
    onCreateEvent({
      day: parseDayKey(selection.dayKey),
      start: quickStart,
      end: quickEnd,
      title: quickTitle.trim(),
    });
    closeQuick();
  }

  const selectedCrm = crmEvents.find((event) => event.id === selectedCrmId) ?? null;
  const dayIndex = selection
    ? days.findIndex((day) => dayKeyOf(day) === selection.dayKey)
    : -1;
  const showNow =
    days.some((day) => dayKeyOf(day) === todayKey) &&
    nowMin >= DAY_START_MIN &&
    nowMin <= DAY_END_MIN;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <div
        className="grid border-b border-border/70"
        style={{ gridTemplateColumns: `4.5rem repeat(${dayCount}, minmax(0, 1fr))` }}
      >
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
                {day.toLocaleDateString(undefined, {
                  weekday: isDayView ? "long" : "short",
                })}
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

      <div
        ref={scrollRef}
        className="max-h-[min(72vh,46rem)] overflow-auto overscroll-contain"
      >
        <div
          className="grid"
          style={{ gridTemplateColumns: `4.5rem repeat(${dayCount}, minmax(0, 1fr))` }}
        >
          <div className="relative border-r border-border/60 bg-muted/10">
            <div style={{ height: GRID_HEIGHT }} className="relative">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground"
                  style={{ top: ((hour * 60 - DAY_START_MIN) / 60) * HOUR_HEIGHT }}
                >
                  {formatHourLabel(hour)}
                </div>
              ))}
            </div>
          </div>

          {days.map((day) => {
            const key = dayKeyOf(day);
            const dayCrm = laidOutCrm.get(key) ?? [];
            const dayGoogle = laidOutGoogle.get(key) ?? [];
            const isToday = key === todayKey;
            const sel = selection && selection.dayKey === key ? selection : null;

            return (
              <div
                key={key}
                data-day-column={key}
                className={cn(
                  "relative cursor-crosshair touch-none border-r border-border/60 last:border-r-0",
                  isToday && "bg-primary/[0.03]",
                )}
                style={{ height: GRID_HEIGHT }}
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).closest("[data-event]")) return;
                  if ((e.target as HTMLElement).closest("[data-quick-panel]")) return;
                  e.preventDefault();
                  beginCreate(key, e.clientY, e.currentTarget.getBoundingClientRect().top);
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

                {showNow && isToday ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-[4] flex items-center"
                    style={{ top: ((nowMin - DAY_START_MIN) / 60) * HOUR_HEIGHT }}
                  >
                    <span className="-ml-1 size-2 rounded-full bg-rose-500" />
                    <span className="h-px flex-1 bg-rose-500" />
                  </div>
                ) : null}

                {dayGoogle.map((event) => (
                  <div
                    key={event.id}
                    data-event
                    className="absolute z-[1] overflow-hidden rounded-md border border-dashed border-sky-400/50 bg-sky-500/10 px-1.5 py-1 text-[11px] text-sky-950 dark:text-sky-50"
                    style={{
                      top: event.top,
                      height: event.height,
                      ...columnStyle(event.column, event.columnCount),
                    }}
                    title={`${event.title} · Google`}
                  >
                    <p className="truncate font-medium">{event.title}</p>
                    <p className="truncate opacity-70">
                      {event.allDay ? "All day" : `${formatTime(event.startsAt)} · Google`}
                    </p>
                  </div>
                ))}

                {dayCrm.map((event) => {
                  const moving = movePreview?.eventId === event.id ? movePreview : null;
                  const resizing = resizePreview?.eventId === event.id ? resizePreview : null;
                  const previewDay = moving?.dayKey ?? resizing?.dayKey ?? key;
                  if (previewDay !== key && (moving || resizing)) return null;

                  let top = event.top;
                  let height = event.height;
                  if (moving && moving.dayKey === key) {
                    top = ((moving.startMin - DAY_START_MIN) / 60) * HOUR_HEIGHT;
                    height = Math.max((moving.durationMin / 60) * HOUR_HEIGHT, 22);
                  } else if (resizing && resizing.dayKey === key) {
                    top = ((resizing.startMin - DAY_START_MIN) / 60) * HOUR_HEIGHT;
                    height = Math.max(((resizing.endMin - resizing.startMin) / 60) * HOUR_HEIGHT, 22);
                  }

                  return (
                    <button
                      key={event.id}
                      type="button"
                      data-event
                      className={cn(
                        "absolute z-[2] select-none overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] text-white shadow-sm transition",
                        selectedCrmId === event.id && "ring-2 ring-foreground/40 ring-offset-1",
                        (moving || resizing) && "opacity-90 shadow-lg",
                      )}
                      style={{
                        top,
                        height,
                        backgroundColor: calendarColor(event.assignee),
                        borderColor: "transparent",
                        ...columnStyle(event.column, event.columnCount),
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        beginMove(event, e.clientY);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onEditEvent(event);
                      }}
                    >
                      <p className="truncate font-semibold">{event.title}</p>
                      {height > 28 ? (
                        <p className="truncate opacity-90">
                          {formatTime(event.startsAt)} · {EVENT_KIND_LABELS[event.kind]}
                        </p>
                      ) : null}
                      <span
                        data-resize-handle
                        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          beginResize(event);
                        }}
                      />
                    </button>
                  );
                })}

                {movePreview &&
                movePreview.dayKey === key &&
                !dayCrm.some((event) => event.id === movePreview.eventId) ? (
                  <div
                    className="pointer-events-none absolute inset-x-1 z-[3] rounded-md border border-dashed border-primary/60 bg-primary/20"
                    style={{
                      top: ((movePreview.startMin - DAY_START_MIN) / 60) * HOUR_HEIGHT,
                      height: Math.max((movePreview.durationMin / 60) * HOUR_HEIGHT, 22),
                    }}
                  />
                ) : null}

                {sel ? (
                  <div
                    className="pointer-events-none absolute inset-x-1 z-[3] rounded-md border border-primary/50 bg-primary/15"
                    style={{
                      top: ((sel.startMin - DAY_START_MIN) / 60) * HOUR_HEIGHT,
                      height: Math.max(((sel.endMin - sel.startMin) / 60) * HOUR_HEIGHT, 22),
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
          className="absolute z-20 w-[min(22rem,calc(100%-1.5rem))] rounded-xl border border-border bg-popover shadow-xl"
          style={{
            top: 72,
            left: isDayView
              ? "1rem"
              : `clamp(0.75rem, calc(4.5rem + ${(Math.max(dayIndex, 0) / dayCount) * 100}% * 0.86), calc(100% - 22.5rem))`,
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
                · {minutesToLabel(selection.startMin)} – {minutesToLabel(selection.endMin)}
              </p>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Close" onClick={closeQuick}>
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
                <Input type="time" value={quickStart} onChange={(e) => setQuickStart(e.target.value)} />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                End
                <Input type="time" value={quickEnd} onChange={(e) => setQuickEnd(e.target.value)} />
              </label>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={openFullEditor}>
                More options
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={closeQuick}>
                  Cancel
                </Button>
                <Button type="button" size="sm" disabled={!quickTitle.trim()} onClick={saveQuick}>
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
          <div className="h-2" style={{ backgroundColor: calendarColor(selectedCrm.assignee) }} />
          <div className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-lg font-semibold leading-tight">{selectedCrm.title}</p>
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
              <p className="text-sm text-muted-foreground">{selectedCrm.location}</p>
            ) : null}
            {selectedCrm.notes ? (
              <p className="text-sm text-muted-foreground">{selectedCrm.notes}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Drag to move · pull the bottom edge to resize · double-click to edit
            </p>
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
