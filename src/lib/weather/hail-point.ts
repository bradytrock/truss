import { pointInGeometry } from "./geometry.ts";
import { hailBin } from "./hail.ts";
import type { HailStorm } from "./sample-storms.ts";
import { locateOnTrack, passageWindow } from "./track.ts";

export type HailPopupHit = {
  stormId: string;
  stormDate: string;
  radarSite: string;
  stormMaxIn: number;
  maxBandIn: number;
  distanceMi: number;
  passageAt: string;
  passedStart: string;
  passedEnd: string;
  report: { sizeIn: number; place: string; reportedAt: string } | null;
  jobsInSwath: number | null;
  source: string;
};

export function toPopupHit(hit: HailHit): HailPopupHit {
  return {
    stormId: hit.storm.id,
    stormDate: hit.storm.stormDate,
    radarSite: hit.storm.radarSite,
    stormMaxIn: hit.storm.stormMaxIn,
    maxBandIn: hit.maxBandIn,
    distanceMi: hit.distanceMi,
    passageAt: hit.passageAt,
    passedStart: hit.passedStart,
    passedEnd: hit.passedEnd,
    report: hit.storm.report
      ? {
          sizeIn: hit.storm.report.sizeIn,
          place: hit.storm.report.place,
          reportedAt: hit.storm.report.reportedAt,
        }
      : null,
    jobsInSwath: hit.jobsInSwath,
    source: hit.storm.source,
  };
}

export type HailHit = {
  storm: HailStorm;
  maxBandIn: number;
  distanceMi: number;
  passageAt: string;
  passedStart: string;
  passedEnd: string;
  jobsInSwath: number | null;
};

export type MapJobPoint = { lat: number; lng: number };

const CHICAGO = "America/Chicago";

export function chicagoParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day") };
}

export function sinceDate(days: number, now = new Date()) {
  const today = chicagoParts(now);
  const utc = new Date(Date.UTC(today.year, today.month - 1, today.day));
  utc.setUTCDate(utc.getUTCDate() - days);
  return utc.toISOString().slice(0, 10);
}

export function chicagoDaysAgo(stormDate: string, now = new Date()) {
  const [year, month, day] = stormDate.split("-").map(Number);
  if (!year || !month || !day) return 0;
  const today = chicagoParts(now);
  const thenUtc = Date.UTC(year, month - 1, day);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  return Math.max(0, Math.round((todayUtc - thenUtc) / 86_400_000));
}

export function chicagoDaysAgoFromIso(iso: string, now = new Date()) {
  const then = chicagoParts(new Date(iso));
  if (!then.year || !then.month || !then.day) return 0;
  const today = chicagoParts(now);
  const thenUtc = Date.UTC(then.year, then.month - 1, then.day);
  const todayUtc = Date.UTC(today.year, today.month - 1, today.day);
  return Math.max(0, Math.round((todayUtc - thenUtc) / 86_400_000));
}

export function formatHailInches(inches: number) {
  const fixed = inches.toFixed(2);
  const body = inches < 1 ? fixed.slice(1) : fixed;
  return `${body}\u2033`;
}

export function formatStormDate(stormDate: string) {
  return formatStormParts(stormDate, { weekday: "short", month: "short", day: "numeric" });
}

export function formatChipDate(stormDate: string) {
  return formatStormParts(stormDate, { month: "short", day: "numeric" });
}

function formatStormParts(stormDate: string, options: Intl.DateTimeFormatOptions) {
  const [year, month, day] = stormDate.split("-").map(Number);
  if (!year || !month || !day) return stormDate;
  const date = new Date(Date.UTC(year, month - 1, day, 18, 0, 0));
  return new Intl.DateTimeFormat("en-US", { timeZone: CHICAGO, ...options }).format(date);
}

export function formatChicagoClock(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

export function formatChicagoRange(startIso: string, endIso: string) {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: CHICAGO,
    hour: "numeric",
    minute: "2-digit",
  };
  const start = new Intl.DateTimeFormat("en-US", options).format(new Date(startIso));
  const end = new Intl.DateTimeFormat("en-US", options).format(new Date(endIso));
  return `${start}–${end}`;
}

export function daysAgoLabel(days: number, short = false) {
  if (days === 0) return short ? "today" : "today";
  if (days === 1) return short ? "1 day" : "1 day ago";
  return short ? `${days} days` : `${days} days ago`;
}

export function outerBand(storm: HailStorm) {
  return storm.bands.reduce((outer, band) => (band.sizeIn < outer.sizeIn ? band : outer));
}

export function jobsInsideStorm(storm: HailStorm, jobs: MapJobPoint[]) {
  const outer = outerBand(storm);
  let count = 0;
  for (const job of jobs) {
    if (!Number.isFinite(job.lat) || !Number.isFinite(job.lng)) continue;
    if (pointInGeometry(job.lng, job.lat, outer.geometry)) count += 1;
  }
  return count;
}

export function hailAtPoint(
  storms: HailStorm[],
  lat: number,
  lng: number,
  options?: { sinceDays?: number; now?: Date; jobs?: MapJobPoint[] },
): HailHit[] {
  const since = sinceDate(options?.sinceDays ?? 90, options?.now);
  const jobs = options?.jobs;
  const hits: HailHit[] = [];
  for (const storm of storms) {
    if (storm.stormDate < since) continue;
    let maxBandIn = 0;
    for (const band of storm.bands) {
      if (band.sizeIn > maxBandIn && pointInGeometry(lng, lat, band.geometry)) maxBandIn = band.sizeIn;
    }
    if (maxBandIn <= 0) continue;
    const located = locateOnTrack(lat, lng, storm.track);
    const passage = passageWindow(storm.startedAt, storm.endedAt, located.fraction);
    hits.push({
      storm,
      maxBandIn,
      distanceMi: located.distanceMi,
      passageAt: passage.passageAt,
      passedStart: passage.passedStart,
      passedEnd: passage.passedEnd,
      jobsInSwath: jobs ? jobsInsideStorm(storm, jobs) : null,
    });
  }
  return newestFirst(hits);
}

export function newestFirst(hits: HailHit[]) {
  return [...hits].sort((a, b) => Date.parse(b.storm.startedAt) - Date.parse(a.storm.startedAt) || b.maxBandIn - a.maxBandIn);
}

export function headerHit(hits: HailHit[]) {
  return [...hits].sort((a, b) => b.maxBandIn - a.maxBandIn || Date.parse(b.storm.startedAt) - Date.parse(a.storm.startedAt))[0] ?? null;
}

export function splitVisibleStorms(hits: HailHit[], hiddenIds: ReadonlySet<string>) {
  const visible: HailHit[] = [];
  const hidden: HailHit[] = [];
  for (const hit of hits) {
    if (hiddenIds.has(hit.storm.id)) hidden.push(hit);
    else visible.push(hit);
  }
  return { visible, hidden };
}

export function hiddenStormNote(hidden: HailHit[]) {
  if (!hidden.length) return "";
  const names = hidden.map((hit) => {
    const label = hailBin(hit.storm.stormMaxIn)?.label ?? formatHailInches(hit.storm.stormMaxIn);
    return `${formatChipDate(hit.storm.stormDate)} (${label})`;
  });
  if (names.length === 1) return `${names[0]} is hidden and does cover this point.`;
  return `${names.join(", ")} are hidden and cover this point.`;
}

export function hoverReadout(hits: HailHit[]) {
  const top = headerHit(hits);
  if (!top) return "No hail here";
  const bin = hailBin(top.maxBandIn);
  const name = bin?.label ?? "";
  const extra = hits.length > 1 ? ` · +${hits.length - 1} more` : "";
  return `${formatHailInches(top.maxBandIn)} ${name} · ${formatChipDate(top.storm.stormDate)}${extra}`;
}

export function radarCategory(dbz: number) {
  if (dbz >= 55) return "Heavy · hail possible";
  if (dbz >= 40) return "Heavy rain";
  return "Moderate rain";
}

export function hailChanceLabel(dbz: number) {
  if (dbz >= 60) return "High";
  if (dbz >= 55) return "Possible";
  if (dbz >= 45) return "Low";
  return "Unlikely";
}

const RADAR_SITES = [
  { id: "KFWS", lat: 32.573, lng: -97.303 },
  { id: "KGRK", lat: 30.722, lng: -97.383 },
  { id: "KEWX", lat: 29.704, lng: -98.028 },
  { id: "KDYX", lat: 32.538, lng: -99.254 },
  { id: "KSHV", lat: 32.451, lng: -93.841 },
  { id: "KFDR", lat: 34.362, lng: -98.977 },
];

export function nearestRadarSite(lat: number, lng: number) {
  let best = RADAR_SITES[0];
  let bestMiles = Infinity;
  for (const site of RADAR_SITES) {
    const miles = Math.hypot((lat - site.lat) * 69, (lng - site.lng) * 55);
    if (miles < bestMiles) {
      best = site;
      bestMiles = miles;
    }
  }
  return best?.id ?? "KFWS";
}

/**
 * Approximate dBZ from an IEM NEXRAD tile color.
 * TODO: replace with a real reflectivity grid (MRMS or the IEM raster value).
 */
export function dbzFromRgba(r: number, g: number, b: number, a: number) {
  if (a < 48) return null;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 40) return null;
  if (max - min < 18) return null;
  if (r > 170 && b > 150 && g < 90) return 65;
  if (r > 190 && g < 70 && b < 90) return 55;
  if (r > 190 && g >= 70 && g < 170 && b < 90) return 48;
  if (r > 180 && g > 170 && b < 90) return 40;
  if (g > 150 && r < 140 && b < 100) return 30;
  if (g > 120 && b > 80 && r < 100) return 22;
  return null;
}

export function radarActive(dbz: number | null) {
  return dbz != null && dbz >= 20;
}

/** Leaflet panBy offset so a popup anchored on (x, y) stays inside the padded map. */
export function popupPanDelta(input: {
  x: number;
  y: number;
  mapWidth: number;
  mapHeight: number;
  popupWidth: number;
  popupHeight: number;
  padTop: number;
  padBottom: number;
  padX: number;
}) {
  const width = Math.min(input.popupWidth, Math.max(160, input.mapWidth - 48));
  let left = input.x - width / 2;
  let top = input.y - input.popupHeight - 14;
  if (top < input.padTop) top = input.y + 14;
  left = Math.max(input.padX, Math.min(left, input.mapWidth - width - input.padX));
  let x = 0;
  let y = 0;
  if (left < input.padX) x = left - input.padX;
  const rightOverflow = left + width - (input.mapWidth - input.padX);
  if (rightOverflow > 0) x = rightOverflow;
  if (top < input.padTop) y = top - input.padTop;
  const bottomOverflow = top + input.popupHeight - (input.mapHeight - input.padBottom);
  if (bottomOverflow > 0) y = bottomOverflow;
  return {
    x: Math.round(x),
    y: Math.round(y),
  };
}

export function formatCoord(value: number) {
  return value.toFixed(4);
}
