import { milesBetween } from "./geometry.ts";
import type { LngLat, Ring, WeatherGeometry } from "./types.ts";

const MILES_PER_DEG = 69.172;
const METERS_PER_DEG_LAT = 111_320;

/** Half-width of the "passed over" window, matching hail_at_point in SQL. */
export const PASSAGE_HALF_MINUTES = 4.5;

export function destination(lng: number, lat: number, bearingRad: number, meters: number): LngLat {
  const dLat = (meters * Math.cos(bearingRad)) / METERS_PER_DEG_LAT;
  const cosLat = Math.cos((lat * Math.PI) / 180) || 1e-6;
  const dLng = (meters * Math.sin(bearingRad)) / (METERS_PER_DEG_LAT * cosLat);
  return [lng + dLng, lat + dLat];
}

function bearing(a: LngLat, b: LngLat) {
  const lat0 = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const x = (b[0] - a[0]) * Math.cos(lat0);
  const y = b[1] - a[1];
  return Math.atan2(x, y);
}

function circleRing(center: LngLat, radiusMeters: number, steps = 16): Ring {
  const ring: Ring = [];
  for (let i = 0; i < steps; i++) {
    ring.push(destination(center[0], center[1], (i / steps) * Math.PI * 2, radiusMeters));
  }
  const first = ring[0];
  if (first) ring.push(first);
  return ring;
}

/**
 * Swath polygon for a track. Each vertex is a circle and each segment is a
 * rectangle, returned as one MultiPolygon so a point within the radius of the
 * line is inside without needing a polygon union.
 */
export function bufferTrack(track: LngLat[], radiusMeters: number): WeatherGeometry {
  const polygons: Ring[][] = [];
  for (const point of track) {
    if (!point) continue;
    polygons.push([circleRing(point, radiusMeters)]);
  }
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i];
    const b = track[i + 1];
    if (!a || !b) continue;
    const dir = bearing(a, b);
    const left = dir - Math.PI / 2;
    const right = dir + Math.PI / 2;
    const aL = destination(a[0], a[1], left, radiusMeters);
    const aR = destination(a[0], a[1], right, radiusMeters);
    const bL = destination(b[0], b[1], left, radiusMeters);
    const bR = destination(b[0], b[1], right, radiusMeters);
    polygons.push([[aL, bL, bR, aR, aL]]);
  }
  return { type: "MultiPolygon", coordinates: polygons };
}

function projectSegment(lat: number, lng: number, a: LngLat, b: LngLat) {
  const lat0 = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const xScale = MILES_PER_DEG * Math.cos(lat0);
  const ax = a[0] * xScale;
  const ay = a[1] * MILES_PER_DEG;
  const bx = b[0] * xScale;
  const by = b[1] * MILES_PER_DEG;
  const px = lng * xScale;
  const py = lat * MILES_PER_DEG;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  return { t, distanceMi: Math.hypot(px - cx, py - cy) };
}

/** Closest approach to the track, and how far along it (0 at the start, 1 at the end). */
export function locateOnTrack(lat: number, lng: number, track: LngLat[]) {
  if (track.length === 1) {
    const only = track[0];
    return {
      distanceMi: only ? milesBetween({ lat, lng }, { lat: only[1], lng: only[0] }) : Infinity,
      fraction: 0,
    };
  }
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i];
    const b = track[i + 1];
    const len = a && b ? milesBetween({ lat: a[1], lng: a[0] }, { lat: b[1], lng: b[0] }) : 0;
    lengths.push(len);
    total += len;
  }
  let best = { distanceMi: Infinity, fraction: 0 };
  let cursor = 0;
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i];
    const b = track[i + 1];
    const len = lengths[i] ?? 0;
    if (!a || !b) continue;
    const proj = projectSegment(lat, lng, a, b);
    const fraction = total > 0 ? (cursor + proj.t * len) / total : 0;
    if (proj.distanceMi < best.distanceMi) best = { distanceMi: proj.distanceMi, fraction };
    cursor += len;
  }
  return best;
}

export function passageWindow(startedAt: string, endedAt: string, fraction: number) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const clamped = Math.min(1, Math.max(0, fraction));
  const at = start + (end - start) * clamped;
  const half = PASSAGE_HALF_MINUTES * 60_000;
  return {
    passageAt: new Date(at).toISOString(),
    passedStart: new Date(at - half).toISOString(),
    passedEnd: new Date(at + half).toISOString(),
  };
}
