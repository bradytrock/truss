import { milesBetween } from "./geometry.ts";
import { destination } from "./track.ts";
import type { StormCell } from "./types.ts";

export const MPH_PER_KNOT = 1.15078;
/** How wide the forecast cone is drawn, either side of the track. */
export const PATH_HALF_WIDTH_MI = 3;
/** A cell this close is "overhead" rather than "incoming". */
export const OVERHEAD_RADIUS_MI = 2.5;
/** Cells slower than this are treated as parked: no arrival times. */
const MIN_MOVING_KT = 5;
/** A cell not scanned this long after the newest scan has dissipated. */
const STALE_MS = 16 * 60 * 1000;

export type CellKind = "supercell" | "multicell" | "developing" | "weakening";

export type CellPathHit<T> = { job: T; etaMinutes: number; overhead: boolean };

/**
 * Parse the IEM NEXRAD storm attribute CSV (one row per cell per scan) into the
 * latest scan of each cell that is still on the radar.
 */
export function parseStormAttributes(csv: string, now = new Date()): StormCell[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  const header = lines.shift();
  if (!header || /^ERROR/i.test(header)) return [];
  const columns = header.split(",").map((name) => name.trim().toUpperCase());
  const at = (row: string[], name: string) => row[columns.indexOf(name)] ?? "";
  const latest = new Map<string, StormCell>();
  const previousDbz = new Map<string, number>();
  for (const line of lines) {
    const row = line.split(",");
    const valid = parseValid(at(row, "VALID"));
    const id = at(row, "STORM_ID").trim();
    const lat = Number(at(row, "LAT"));
    const lng = Number(at(row, "LON"));
    if (!valid || !id || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const maxDbz = numberOr(at(row, "MAX_DBZ"), 0);
    const existing = latest.get(id);
    if (existing && Date.parse(existing.valid) >= Date.parse(valid)) continue;
    if (existing) previousDbz.set(id, existing.maxDbz);
    const before = previousDbz.get(id);
    latest.set(id, {
      id,
      radarSite: siteName(at(row, "NEXRAD")),
      valid,
      lat,
      lng,
      maxDbz,
      echoTopKft: numberOr(at(row, "TOP"), 0),
      vil: numberOr(at(row, "VIL"), 0),
      posh: numberOr(at(row, "POSH"), 0),
      poh: numberOr(at(row, "POH"), 0),
      meshIn: numberOr(at(row, "MAX_SIZE"), 0),
      motionFromDeg: numberOr(at(row, "DRCT"), 0),
      motionKt: numberOr(at(row, "SKNT"), 0),
      tvs: flag(at(row, "TVS")),
      meso: flag(at(row, "MESO")),
      dbzTrend: before == null ? null : maxDbz - before,
    });
  }
  const cells = [...latest.values()];
  const newest = Math.max(now.getTime() - STALE_MS, ...cells.map((cell) => Date.parse(cell.valid)));
  return cells
    .filter((cell) => newest - Date.parse(cell.valid) <= STALE_MS)
    .sort((a, b) => b.maxDbz - a.maxDbz || a.id.localeCompare(b.id));
}

function parseValid(raw: string) {
  const digits = raw.trim();
  const match = digits.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!match) return Number.isNaN(Date.parse(digits)) ? "" : new Date(digits).toISOString();
  const [, year, month, day, hour, minute] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))).toISOString();
}

function siteName(raw: string) {
  const site = raw.trim().toUpperCase();
  if (!site) return "NEXRAD";
  return site.length === 3 ? `K${site}` : site;
}

function flag(raw: string) {
  const value = raw.trim().toUpperCase();
  return Boolean(value) && value !== "NONE" && value !== "0" && value !== "N";
}

function numberOr(raw: string, fallback: number) {
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** Keep the cells a radar desk would tag: strong enough to matter, or carrying hail or rotation. */
export function significantCells(cells: StormCell[]) {
  return cells.filter((cell) => cell.maxDbz >= 45 || cell.meshIn >= 0.5 || cell.tvs || cell.meso || cell.posh >= 20);
}

export function cellKind(cell: StormCell): CellKind {
  if (cell.tvs || cell.meso) return "supercell";
  if (cell.meshIn >= 0.75 || cell.posh >= 30) return "multicell";
  if ((cell.dbzTrend != null && cell.dbzTrend <= -2) || (cell.maxDbz < 48 && cell.posh < 10)) return "weakening";
  return "developing";
}

export function cellKindLabel(kind: CellKind) {
  if (kind === "supercell") return "Supercell · rotation";
  if (kind === "multicell") return "Multicell · hail";
  if (kind === "weakening") return "Weakening";
  return "Developing";
}

export function cellKindTone(kind: CellKind) {
  if (kind === "supercell") return { background: "#7f1d1d", color: "#fecaca" };
  if (kind === "multicell") return { background: "#713f12", color: "#fde68a" };
  if (kind === "weakening") return { background: "#1f2937", color: "#d1d5db" };
  return { background: "#1e3a5f", color: "#bfdbfe" };
}

export function cellMoving(cell: StormCell) {
  return cell.motionKt >= MIN_MOVING_KT;
}

export function cellMph(cell: StormCell) {
  return Math.round(cell.motionKt * MPH_PER_KNOT);
}

/** Bearing the cell is moving toward, in degrees. */
export function cellHeadingDeg(cell: StormCell) {
  return (cell.motionFromDeg + 180) % 360;
}

const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export function compassPoint(deg: number) {
  const index = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return POINTS[index] ?? "N";
}

/** "E 21 mph", or "Stationary" for a parked cell. */
export function formatMotion(cell: StormCell) {
  if (!cellMoving(cell)) return "Stationary";
  return `${compassPoint(cellHeadingDeg(cell))} ${cellMph(cell)} mph`;
}

/** Where the cell is expected in `minutes`, along its current motion. */
export function projectCell(cell: StormCell, minutes: number) {
  if (!cellMoving(cell)) return { lat: cell.lat, lng: cell.lng };
  const miles = (cell.motionKt * MPH_PER_KNOT * minutes) / 60;
  const [lng, lat] = destination(cell.lng, cell.lat, (cellHeadingDeg(cell) * Math.PI) / 180, miles * 1609.344);
  return { lat, lng };
}

/** Along-track and cross-track miles from the cell to a point, relative to its motion. */
function trackOffsets(cell: StormCell, lat: number, lng: number) {
  const cosLat = Math.cos((cell.lat * Math.PI) / 180);
  const east = (lng - cell.lng) * 69.172 * cosLat;
  const north = (lat - cell.lat) * 69.172;
  const heading = (cellHeadingDeg(cell) * Math.PI) / 180;
  const along = east * Math.sin(heading) + north * Math.cos(heading);
  const across = Math.abs(east * Math.cos(heading) - north * Math.sin(heading));
  return { along, across };
}

export type CellApproach =
  | { status: "overhead"; clearsInMinutes: number | null; distanceMi: number }
  | { status: "incoming"; etaMinutes: number; lateralMi: number; distanceMi: number }
  | { status: "passed"; distanceMi: number }
  | { status: "clear"; distanceMi: number };

/**
 * How a cell relates to a point: already over it, on its way, gone past, or
 * not tracking toward it at all.
 */
export function cellApproach(cell: StormCell, lat: number, lng: number, options?: { halfWidthMi?: number; maxMinutes?: number }): CellApproach {
  const distanceMi = milesBetween(cell, { lat, lng });
  const halfWidth = options?.halfWidthMi ?? PATH_HALF_WIDTH_MI;
  const maxMinutes = options?.maxMinutes ?? 90;
  if (distanceMi <= OVERHEAD_RADIUS_MI) {
    if (!cellMoving(cell)) return { status: "overhead", clearsInMinutes: null, distanceMi };
    const { along } = trackOffsets(cell, lat, lng);
    const mph = cell.motionKt * MPH_PER_KNOT;
    return { status: "overhead", clearsInMinutes: Math.max(1, Math.round(((along + OVERHEAD_RADIUS_MI) / mph) * 60)), distanceMi };
  }
  if (!cellMoving(cell)) return { status: "clear", distanceMi };
  const { along, across } = trackOffsets(cell, lat, lng);
  if (across > halfWidth) return { status: "clear", distanceMi };
  if (along < 0) return { status: "passed", distanceMi };
  const mph = cell.motionKt * MPH_PER_KNOT;
  const etaMinutes = Math.round((along / mph) * 60);
  if (etaMinutes > maxMinutes) return { status: "clear", distanceMi };
  return { status: "incoming", etaMinutes: Math.max(1, etaMinutes), lateralMi: across, distanceMi };
}

/** Jobs the cell will pass over, soonest first, with the ones under it right now at the top. */
export function jobsInPath<T extends { lat: number; lng: number }>(cell: StormCell, jobs: T[], options?: { halfWidthMi?: number; maxMinutes?: number }): CellPathHit<T>[] {
  const hits: CellPathHit<T>[] = [];
  for (const job of jobs) {
    if (!Number.isFinite(job.lat) || !Number.isFinite(job.lng)) continue;
    const approach = cellApproach(cell, job.lat, job.lng, options);
    if (approach.status === "overhead") hits.push({ job, etaMinutes: 0, overhead: true });
    else if (approach.status === "incoming") hits.push({ job, etaMinutes: approach.etaMinutes, overhead: false });
  }
  return hits.sort((a, b) => a.etaMinutes - b.etaMinutes);
}

/** Arrival at each town along the path, taken from the job sites in that town. */
export function townArrivals<T extends { lat: number; lng: number; city: string }>(cell: StormCell, jobs: T[], limit = 3) {
  const groups = new Map<string, { city: string; lat: number; lng: number; count: number }>();
  for (const job of jobs) {
    const city = job.city.trim();
    if (!city || !Number.isFinite(job.lat) || !Number.isFinite(job.lng)) continue;
    const key = city.toLowerCase();
    const group = groups.get(key) ?? { city, lat: 0, lng: 0, count: 0 };
    group.lat += job.lat;
    group.lng += job.lng;
    group.count += 1;
    groups.set(key, group);
  }
  const rows: Array<{ city: string; etaMinutes: number }> = [];
  for (const group of groups.values()) {
    const approach = cellApproach(cell, group.lat / group.count, group.lng / group.count, { halfWidthMi: PATH_HALF_WIDTH_MI + 2 });
    if (approach.status === "incoming") rows.push({ city: group.city, etaMinutes: approach.etaMinutes });
    else if (approach.status === "overhead") rows.push({ city: group.city, etaMinutes: 0 });
  }
  return rows.sort((a, b) => a.etaMinutes - b.etaMinutes).slice(0, limit);
}

export function nearestCell(cells: StormCell[], lat: number, lng: number) {
  let best: { cell: StormCell; miles: number } | null = null;
  for (const cell of cells) {
    const miles = milesBetween(cell, { lat, lng });
    if (!best || miles < best.miles) best = { cell, miles };
  }
  return best;
}

export type PointThreat = {
  overhead: { cell: StormCell; clearsInMinutes: number | null } | null;
  incoming: { cell: StormCell; etaMinutes: number } | null;
  nearestMi: number | null;
};

/** The one cell over a point and the next one coming, for a job card. */
export function pointThreat(cells: StormCell[], lat: number, lng: number): PointThreat {
  let overhead: PointThreat["overhead"] = null;
  let incoming: PointThreat["incoming"] = null;
  let nearestMi: number | null = null;
  for (const cell of cells) {
    const approach = cellApproach(cell, lat, lng);
    if (nearestMi == null || approach.distanceMi < nearestMi) nearestMi = approach.distanceMi;
    if (approach.status === "overhead" && (!overhead || cell.maxDbz > overhead.cell.maxDbz)) {
      overhead = { cell, clearsInMinutes: approach.clearsInMinutes };
    } else if (approach.status === "incoming" && (!incoming || approach.etaMinutes < incoming.etaMinutes)) {
      incoming = { cell, etaMinutes: approach.etaMinutes };
    }
  }
  return { overhead, incoming, nearestMi };
}

/** Wind the cell is likely carrying, for a "threat" line. Rough, from VIL and reflectivity. */
export function cellWindMph(cell: StormCell) {
  if (cell.vil >= 55 || cell.maxDbz >= 65) return 70;
  if (cell.vil >= 40 || cell.maxDbz >= 60) return 60;
  if (cell.vil >= 25 || cell.maxDbz >= 55) return 50;
  return 0;
}

export function cellThreatText(cell: StormCell) {
  const parts: string[] = [];
  if (cell.meshIn >= 0.5) parts.push(`${cell.meshIn.toFixed(2)}″ hail`);
  const wind = cellWindMph(cell);
  if (wind) parts.push(`${wind} mph`);
  if (cell.tvs) parts.push("TVS");
  else if (cell.meso) parts.push("rotation");
  return parts.join(" · ") || "Rain";
}

export function etaIso(fromIso: string, minutes: number) {
  return new Date(Date.parse(fromIso) + minutes * 60_000).toISOString();
}

/** Minutes between the latest scan and now, so an ETA counts down instead of drifting. */
export function minutesSince(iso: string, now = new Date()) {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, Math.round((now.getTime() - at) / 60_000));
}

export type CellSnapshot = { id: string; maxDbz: number; meshIn: number; posh: number };

/** Message when a watched cell got worse since the saved snapshot, or null when it did not. */
export function cellGrowthNote(previous: CellSnapshot, next: StormCell) {
  const hail = next.meshIn - previous.meshIn;
  if (hail >= 0.25) return `Cell ${next.id} grew: hail is now ${next.meshIn.toFixed(2)}″.`;
  if (next.posh - previous.posh >= 20) return `Cell ${next.id} grew: severe hail chance is ${Math.round(next.posh)}%.`;
  if (next.maxDbz - previous.maxDbz >= 5) return `Cell ${next.id} grew: ${Math.round(next.maxDbz)} dBZ.`;
  return null;
}

export function snapshotCell(cell: StormCell): CellSnapshot {
  return { id: cell.id, maxDbz: cell.maxDbz, meshIn: cell.meshIn, posh: cell.posh };
}

/** Quarter-sized and up damages shingles; penny usually does not. */
export function roofDamageLabel(inches: number) {
  if (inches >= 1.5) return "roof damage likely";
  if (inches >= 1) return "roof damage possible";
  return "cosmetic at most";
}
