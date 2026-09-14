/** Geometry helpers for the day/week calendar grid. */

export const HOUR_HEIGHT = 56;
export const DAY_START_MIN = 6 * 60;
export const DAY_END_MIN = 21 * 60;
export const SNAP_MIN = 15;
export const GRID_HEIGHT = ((DAY_END_MIN - DAY_START_MIN) / 60) * HOUR_HEIGHT;
export const DRAG_THRESHOLD_PX = 6;

export function dayKeyOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseDayKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function minutesOf(iso: string) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function snap(min: number) {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}

export function yToMinutes(clientY: number, top: number) {
  const raw = ((clientY - top) / HOUR_HEIGHT) * 60 + DAY_START_MIN;
  return clamp(snap(raw), DAY_START_MIN, DAY_END_MIN);
}

export function minutesToLabel(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatHourLabel(hour: number) {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

export function toTimeValue(totalMin: number) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function positionForRange(startsAt: string, endsAt: string) {
  const start = clamp(minutesOf(startsAt), DAY_START_MIN, DAY_END_MIN);
  const end = clamp(
    Math.max(minutesOf(endsAt), start + SNAP_MIN),
    DAY_START_MIN,
    DAY_END_MIN,
  );
  const top = ((start - DAY_START_MIN) / 60) * HOUR_HEIGHT;
  const height = Math.max(((end - start) / 60) * HOUR_HEIGHT, 22);
  return { top, height, startMin: start, endMin: end };
}

export function applyMinutesToDay(dayKey: string, totalMin: number) {
  const day = parseDayKey(dayKey);
  day.setHours(Math.floor(totalMin / 60), totalMin % 60, 0, 0);
  return day;
}

export function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export type TimedItem = {
  id: string;
  startsAt: string;
  endsAt: string;
};

export type LaidOutItem<T extends TimedItem> = T & {
  column: number;
  columnCount: number;
  top: number;
  height: number;
};

/** Pack overlapping timed items into side-by-side columns. */
export function layoutOverlaps<T extends TimedItem>(items: T[]): LaidOutItem<T>[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => {
    const startDiff = new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    if (startDiff !== 0) return startDiff;
    return new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime();
  });

  type Active = { end: number; column: number };
  const result: LaidOutItem<T>[] = [];
  let cluster: LaidOutItem<T>[] = [];
  let active: Active[] = [];
  let maxCols = 0;

  function flushCluster() {
    for (const item of cluster) {
      item.columnCount = Math.max(maxCols, 1);
      result.push(item);
    }
    cluster = [];
    active = [];
    maxCols = 0;
  }

  for (const item of sorted) {
    const start = minutesOf(item.startsAt);
    const end = Math.max(minutesOf(item.endsAt), start + SNAP_MIN);
    active = active.filter((slot) => slot.end > start);

    if (active.length === 0 && cluster.length > 0) {
      flushCluster();
    }

    const used = new Set(active.map((slot) => slot.column));
    let column = 0;
    while (used.has(column)) column += 1;
    active.push({ end, column });
    maxCols = Math.max(maxCols, column + 1);

    const pos = positionForRange(item.startsAt, item.endsAt);
    cluster.push({
      ...item,
      column,
      columnCount: 1,
      top: pos.top,
      height: pos.height,
    });
  }
  flushCluster();
  return result;
}

export function columnStyle(column: number, columnCount: number) {
  const widthPct = 100 / Math.max(columnCount, 1);
  return {
    left: `calc(${column * widthPct}% + 2px)`,
    width: `calc(${widthPct}% - 4px)`,
  };
}
