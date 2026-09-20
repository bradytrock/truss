"use client";

import Link from "next/link";
import { formatTime } from "@/lib/format";
import {
  HOME_DAY_HOUR_PX,
  HOME_EVENT_COLORS,
  eventBlockOnDay,
  eventsOnDay,
  homeDayGridHeight,
  homeDayHours,
  homeDayKey,
  homeDayTitle,
} from "@/lib/home-day-calendar";
import { EVENT_KIND_LABELS, type ScheduleEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

export function HomeDayCalendar({
  day,
  events,
}: {
  day: Date;
  events: ScheduleEvent[];
}) {
  const dayKey = homeDayKey(day);
  const items = eventsOnDay(events, dayKey);
  const hours = homeDayHours();
  const height = homeDayGridHeight();
  const now = new Date();
  const isToday = now.toDateString() === day.toDateString();
  const nowTop =
    isToday
      ? ((now.getHours() * 60 + now.getMinutes() - hours[0]! * 60) / 60) * HOME_DAY_HOUR_PX
      : null;

  return (
    <div className="px-5 pb-5">
      <p className="text-xs text-[#706e6b]">{homeDayTitle(day)}</p>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-[#706e6b]">
          Nothing on the calendar today.{" "}
          <Link href="/calendar" className="font-semibold text-[#0176d3] hover:underline">
            Open the day
          </Link>
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.slice(0, 3).map((event) => (
            <li key={event.id} className="flex items-start gap-2 text-sm">
              <span
                className="mt-1 size-2 shrink-0 rounded-full"
                style={{ background: HOME_EVENT_COLORS[event.kind] }}
              />
              <div className="min-w-0">
                <p className="truncate font-medium text-[#181818]">{event.title}</p>
                <p className="text-xs text-[#706e6b]">
                  {formatTime(event.startsAt)}–{formatTime(event.endsAt)} · {EVENT_KIND_LABELS[event.kind]}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="relative mt-4 max-h-64 overflow-y-auto rounded-xl border border-black/6 bg-[#f8fafc]">
        <div className="relative" style={{ height }}>
          {hours.slice(0, -1).map((hour, index) => (
            <div
              key={hour}
              className="absolute right-0 left-0 border-t border-black/5"
              style={{ top: index * HOME_DAY_HOUR_PX }}
            >
              <span className="absolute top-0 left-2 -translate-y-1/2 bg-[#f8fafc] px-1 text-[10px] text-[#706e6b]">
                {hour === 12 ? "12 PM" : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
              </span>
            </div>
          ))}
          {items.map((event) => {
            const block = eventBlockOnDay(event);
            return (
              <Link
                key={event.id}
                href="/calendar"
                className={cn(
                  "absolute right-2 left-14 overflow-hidden rounded-lg px-2 py-1 text-left text-white shadow-sm",
                )}
                style={{
                  top: block.top,
                  height: block.height,
                  background: HOME_EVENT_COLORS[event.kind],
                }}
              >
                <span className="block truncate text-[11px] font-semibold">{event.title}</span>
                <span className="block text-[10px] opacity-80">
                  {formatTime(event.startsAt)}–{formatTime(event.endsAt)}
                </span>
              </Link>
            );
          })}
          {nowTop !== null && nowTop >= 0 && nowTop <= height ? (
            <div
              className="absolute right-0 left-0 z-10 border-t-2 border-[#ea001e]"
              style={{ top: nowTop }}
            >
              <span className="absolute -top-1.5 left-0 size-2 rounded-full bg-[#ea001e]" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
