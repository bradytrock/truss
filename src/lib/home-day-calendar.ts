import type { EventKind, ScheduleEvent } from "./types";

export function homeDayKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const HOME_DAY_START_HOUR = 6;
export const HOME_DAY_END_HOUR = 21;
export const HOME_DAY_HOUR_PX = 36;

export function eventsOnDay(events: ScheduleEvent[], dayKey: string) {
  return events
    .filter((event) => homeDayKey(event.startsAt) === dayKey)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title));
}

export function homeDayTitle(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function homeDayHours() {
  return Array.from(
    { length: HOME_DAY_END_HOUR - HOME_DAY_START_HOUR + 1 },
    (_, index) => HOME_DAY_START_HOUR + index,
  );
}

export function homeDayGridHeight() {
  return (HOME_DAY_END_HOUR - HOME_DAY_START_HOUR) * HOME_DAY_HOUR_PX;
}

export function eventBlockOnDay(event: Pick<ScheduleEvent, "startsAt" | "endsAt">) {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const startMin = start.getHours() * 60 + start.getMinutes();
  const rawEnd = end.getHours() * 60 + end.getMinutes();
  const endMin = Math.max(rawEnd, startMin + 30);
  const dayStart = HOME_DAY_START_HOUR * 60;
  const dayEnd = HOME_DAY_END_HOUR * 60;
  const clampedStart = Math.min(Math.max(startMin, dayStart), dayEnd - 15);
  const clampedEnd = Math.min(Math.max(endMin, clampedStart + 20), dayEnd);
  const top = ((clampedStart - dayStart) / 60) * HOME_DAY_HOUR_PX;
  const height = Math.max(((clampedEnd - clampedStart) / 60) * HOME_DAY_HOUR_PX, 22);
  return { top, height };
}

export const HOME_EVENT_COLORS: Record<EventKind, string> = {
  site_walk: "#0176d3",
  pre_bid: "#e8a317",
  inspection: "#2e844a",
  production: "#032d60",
  meeting: "#1b96ff",
  punch: "#7c3aed",
};
