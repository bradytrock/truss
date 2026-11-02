import type { CropGrid } from "./grib.ts";
import { decimateRing, pointInRing } from "./geometry.ts";
import { HAIL_BINS } from "./hail.ts";
import { nearestRadarSite } from "./hail-point.ts";
import type { HailStorm } from "./sample-storms.ts";
import type { LngLat, Ring, WeatherGeometry } from "./types.ts";

/**
 * Turn a NOAA MRMS MESH crop into hail-size polygons.
 * MESH_Max_1440min is the largest radar-estimated hail in the last 24 hours.
 */
export function meshSwathFromGrid(grid: CropGrid): HailStorm | null {
  let maxInches = 0;
  let peakRow = 0;
  let peakCol = 0;
  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      const value = grid.values[row * grid.width + col] ?? Number.NaN;
      if (Number.isFinite(value) && value > maxInches) {
        maxInches = value;
        peakRow = row;
        peakCol = col;
      }
    }
  }
  if (maxInches < 0.75) return null;

  const bands = HAIL_BINS.flatMap((bin) => {
    if (maxInches + 1e-6 < bin.inches) return [];
    const geometry = thresholdGeometry(grid, bin.inches);
    return geometry ? [{ sizeIn: bin.inches, geometry }] : [];
  });
  if (!bands.length) return null;

  const peak = cellCenter(grid, peakRow, peakCol);
  const valid = grid.valid && !Number.isNaN(Date.parse(grid.valid)) ? new Date(grid.valid) : new Date();
  const endedAt = valid.toISOString();
  const startedAt = new Date(valid.getTime() - 24 * 60 * 60 * 1000).toISOString();
  return {
    id: `mesh-${endedAt}`,
    stormDate: chicagoDate(valid),
    startedAt,
    endedAt,
    radarSite: nearestRadarSite(peak[1], peak[0]),
    stormMaxIn: roundInches(maxInches),
    source: "mesh",
    track: [peak],
    bands,
    report: null,
  };
}

function thresholdGeometry(grid: CropGrid, minInches: number): WeatherGeometry | null {
  const on = (row: number, col: number) => {
    if (row < 0 || col < 0 || row >= grid.height || col >= grid.width) return false;
    const value = grid.values[row * grid.width + col] ?? Number.NaN;
    return Number.isFinite(value) && value + 1e-6 >= minInches;
  };
  const next = new Map<string, { at: LngLat; edges: LngLat[] }>();
  const push = (from: LngLat, to: LngLat) => {
    const key = pointKey(from);
    const bucket = next.get(key) ?? { at: from, edges: [] };
    bucket.edges.push(to);
    next.set(key, bucket);
  };
  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      if (!on(row, col)) continue;
      const nw = corner(grid, row, col, "nw");
      const ne = corner(grid, row, col, "ne");
      const se = corner(grid, row, col, "se");
      const sw = corner(grid, row, col, "sw");
      if (!on(row - 1, col)) push(nw, ne);
      if (!on(row, col + 1)) push(ne, se);
      if (!on(row + 1, col)) push(se, sw);
      if (!on(row, col - 1)) push(sw, nw);
    }
  }
  const rings: Ring[] = [];
  for (const startKey of next.keys()) {
    while ((next.get(startKey)?.edges.length ?? 0) > 0) {
      const ring = walkRing(next, startKey);
      if (ring.length >= 4) rings.push(dropCollinear(ring));
    }
  }
  if (!rings.length) return null;

  const outers: Ring[] = [];
  const holes: Ring[] = [];
  for (const ring of rings) {
    const probe = interiorProbe(ring);
    if (probe && onCell(grid, probe[1], probe[0], minInches)) outers.push(ring);
    else holes.push(ring);
  }
  const shells = (outers.length ? outers : rings).map((outer) => {
    const owned = holes.filter((hole) => {
      const probe = interiorProbe(hole);
      return probe ? pointInRing(probe[0], probe[1], outer) : false;
    });
    return [decimateRing(outer, 480), ...owned.map((hole) => decimateRing(hole, 240))];
  });
  if (!shells.length) return null;
  if (shells.length === 1) {
    const only = shells[0];
    return only ? { type: "Polygon", coordinates: only } : null;
  }
  return { type: "MultiPolygon", coordinates: shells };
}

function walkRing(next: Map<string, { at: LngLat; edges: LngLat[] }>, startKey: string): Ring {
  const ring: Ring = [];
  let key = startKey;
  for (let guard = 0; guard < 200_000; guard++) {
    const bucket = next.get(key);
    const point = bucket?.edges.pop();
    if (!bucket || !point) break;
    ring.push(bucket.at);
    key = pointKey(point);
    if (key === startKey) {
      ring.push(point);
      const first = ring[0];
      if (first) ring.push(first);
      break;
    }
  }
  return ring;
}

function dropCollinear(ring: Ring): Ring {
  if (ring.length < 4) return ring;
  const kept: Ring = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const prev = kept[kept.length - 1] ?? ring[(i + ring.length - 2) % (ring.length - 1)];
    const curr = ring[i];
    const next = ring[i + 1];
    if (!prev || !curr || !next) continue;
    const cross = (curr[0] - prev[0]) * (next[1] - curr[1]) - (curr[1] - prev[1]) * (next[0] - curr[0]);
    if (Math.abs(cross) > 1e-10 || kept.length === 0) kept.push(curr);
  }
  const first = kept[0];
  if (first) kept.push(first);
  return kept.length >= 4 ? kept : ring;
}

/** A point just inside the ring. Clockwise rings keep their interior on the right. */
function interiorProbe(ring: Ring): LngLat | null {
  const a = ring[0];
  const b = ring[1];
  if (!a || !b) return null;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const shift = Math.max(Math.abs(dx), Math.abs(dy), 1e-4) * 0.2;
  const clockwise = signedArea(ring) < 0;
  const nx = clockwise ? dy / len : -dy / len;
  const ny = clockwise ? -dx / len : dx / len;
  return [a[0] + dx / 2 + nx * shift, a[1] + dy / 2 + ny * shift];
}

function signedArea(ring: Ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    if (!a || !b) continue;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

function onCell(grid: CropGrid, lat: number, lng: number, minInches: number) {
  const row = Math.round((grid.lat0 - lat) / grid.dlat);
  const col = Math.round((lng - grid.lon0) / grid.dlon);
  if (row < 0 || col < 0 || row >= grid.height || col >= grid.width) return false;
  const value = grid.values[row * grid.width + col] ?? Number.NaN;
  return Number.isFinite(value) && value + 1e-6 >= minInches;
}

function corner(grid: CropGrid, row: number, col: number, which: "nw" | "ne" | "se" | "sw"): LngLat {
  const east = which === "ne" || which === "se" ? 0.5 : -0.5;
  const south = which === "se" || which === "sw" ? 0.5 : -0.5;
  return roundPoint(grid.lon0 + (col + east) * grid.dlon, grid.lat0 - (row + south) * grid.dlat);
}

function cellCenter(grid: CropGrid, row: number, col: number): LngLat {
  return [grid.lon0 + col * grid.dlon, grid.lat0 - row * grid.dlat];
}

function roundPoint(lng: number, lat: number): LngLat {
  return [Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5];
}

function pointKey(point: LngLat) {
  return `${point[0].toFixed(5)},${point[1].toFixed(5)}`;
}

function chicagoDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function roundInches(value: number) {
  return Math.round(value * 100) / 100;
}
