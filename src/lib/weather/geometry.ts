import type { BBox, Ring, WeatherGeometry } from "./types.ts";

export function pointInRing(lng: number, lat: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const intersects = a[1] > lat !== b[1] > lat && lng < ((b[0] - a[0]) * (lat - a[1])) / (b[1] - a[1] || 1e-12) + a[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(lng: number, lat: number, rings: Ring[]) {
  const outer = rings[0];
  if (!outer || !pointInRing(lng, lat, outer)) return false;
  for (let i = 1; i < rings.length; i++) {
    const hole = rings[i];
    if (hole && pointInRing(lng, lat, hole)) return false;
  }
  return true;
}

export function pointInGeometry(lng: number, lat: number, geometry: WeatherGeometry | null | undefined) {
  if (!geometry) return false;
  if (geometry.type === "Polygon") return pointInPolygon(lng, lat, geometry.coordinates);
  return geometry.coordinates.some((polygon) => pointInPolygon(lng, lat, polygon));
}

export function decimateRing(ring: Ring, max = 280): Ring {
  if (ring.length <= max) return ring;
  const step = Math.ceil(ring.length / max);
  const next: Ring = [];
  for (let i = 0; i < ring.length; i += step) {
    const point = ring[i];
    if (point) next.push(point);
  }
  const first = ring[0];
  const last = next[next.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) next.push(first);
  return next;
}

export function decimateGeometry(geometry: WeatherGeometry, max = 280): WeatherGeometry {
  if (geometry.type === "Polygon") {
    return { type: "Polygon", coordinates: geometry.coordinates.map((ring) => decimateRing(ring, max)) };
  }
  return {
    type: "MultiPolygon",
    coordinates: geometry.coordinates.map((polygon) => polygon.map((ring) => decimateRing(ring, max))),
  };
}

function walkRing(ring: Ring, bbox: BBox) {
  for (const point of ring) {
    bbox.west = Math.min(bbox.west, point[0]);
    bbox.east = Math.max(bbox.east, point[0]);
    bbox.south = Math.min(bbox.south, point[1]);
    bbox.north = Math.max(bbox.north, point[1]);
  }
}

export function geometryBBox(geometry: WeatherGeometry | null | undefined): BBox | null {
  if (!geometry) return null;
  const bbox: BBox = { west: 180, south: 90, east: -180, north: -90 };
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) for (const ring of polygon) walkRing(ring, bbox);
  if (bbox.west > bbox.east || bbox.south > bbox.north) return null;
  return bbox;
}

export function bboxesOverlap(a: BBox, b: BBox) {
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}

export function expandBBox(bbox: BBox, degrees: number): BBox {
  return {
    west: bbox.west - degrees,
    south: bbox.south - degrees,
    east: bbox.east + degrees,
    north: bbox.north + degrees,
  };
}

export function bboxOfPoints(points: Array<{ lat: number; lng: number }>): BBox | null {
  let bbox: BBox | null = null;
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) continue;
    if (!bbox) {
      bbox = { west: point.lng, east: point.lng, south: point.lat, north: point.lat };
      continue;
    }
    bbox.west = Math.min(bbox.west, point.lng);
    bbox.east = Math.max(bbox.east, point.lng);
    bbox.south = Math.min(bbox.south, point.lat);
    bbox.north = Math.max(bbox.north, point.lat);
  }
  return bbox;
}

export function pointNearBBox(lng: number, lat: number, bbox: BBox) {
  return lng >= bbox.west && lng <= bbox.east && lat >= bbox.south && lat <= bbox.north;
}

/** Great-circle miles. Short enough for neighborhood comps. */
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function asGeometry(value: unknown): WeatherGeometry | null {
  if (!value || typeof value !== "object") return null;
  const geometry = value as { type?: string; coordinates?: unknown };
  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") return null;
  if (!Array.isArray(geometry.coordinates)) return null;
  return geometry as WeatherGeometry;
}
