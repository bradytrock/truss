import { isValidLatLng } from "./project-map-logic.ts";
import {
  EDGE_KINDS,
  PITCH_RISES,
  addFacet,
  edgeKey,
  emptyDrawing,
  polygonAreaPx,
  setEdgeKind,
  setWastePercent,
  suggestedWastePercent,
  type EdgeKind,
  type RoofDrawing,
} from "./roof-measure.ts";

/** Static Maps zoom. Coverage stays on this zoom; `scale` only adds pixels. */
export const SATELLITE_ZOOM = 20;
/** CSS pixels requested from Static Maps. The file is this times SATELLITE_SCALE. */
export const SATELLITE_CSS_SIZE = 640;
export const SATELLITE_SCALE = 2;

const METERS_PER_FOOT = 0.3048;
/** Equatorial meters per pixel at zoom 0 on a 256px Web Mercator tile. */
const MERCATOR_MPP_ZOOM0 = (2 * Math.PI * 6378137) / 256;

const EDGE_PRIORITY: Record<EdgeKind, number> = {
  eave: 1,
  rake: 2,
  drip: 2,
  parapet: 2,
  flashing: 3,
  step_flashing: 4,
  ridge: 5,
  hip: 6,
  valley: 7,
};

/** A pin the estimator placed. Rejects a missing or 0,0 guess so we do not measure the ocean. */
export function parseVerifiedCoords(
  input: { lat?: unknown; lng?: unknown } | null | undefined,
): { lat: number; lng: number } | null {
  if (!input) return null;
  const lat = typeof input.lat === "number" ? input.lat : Number(input.lat);
  const lng = typeof input.lng === "number" ? input.lng : Number(input.lng);
  if (!isValidLatLng(lat, lng) || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

export function satelliteFeetPerPixel(
  lat: number,
  zoom = SATELLITE_ZOOM,
  scale = SATELLITE_SCALE,
) {
  const safeLat = Number.isFinite(lat) ? Math.min(85, Math.max(-85, lat)) : 0;
  const safeZoom = Number.isFinite(zoom) ? zoom : SATELLITE_ZOOM;
  const safeScale = scale > 0 ? scale : 1;
  const metersPerCssPixel =
    (Math.cos((safeLat * Math.PI) / 180) * MERCATOR_MPP_ZOOM0) / 2 ** safeZoom;
  return metersPerCssPixel / safeScale / METERS_PER_FOOT;
}

export function imagePixelSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    const width = readUint32(bytes, 16);
    const height = readUint32(bytes, 20);
    if (width > 0 && height > 0) return { width, height };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
      if (length < 2) return null;
      if (marker >= 0xc0 && marker <= 0xc2) {
        const height = (bytes[offset + 5] << 8) + bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) + bytes[offset + 8];
        if (width > 0 && height > 0) return { width, height };
        return null;
      }
      offset += 2 + length;
    }
  }
  return null;
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] << 24) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]
  ) >>> 0;
}

function nearestPitch(value: number) {
  const rise = Number.isFinite(value) ? value : 6;
  let best: number = PITCH_RISES[0];
  let dist = Infinity;
  for (const option of PITCH_RISES) {
    const next = Math.abs(option - rise);
    if (next < dist) {
      dist = next;
      best = option;
    }
  }
  return best;
}

function isEdgeKind(value: unknown): value is EdgeKind {
  return typeof value === "string" && (EDGE_KINDS as readonly string[]).includes(value);
}

type TracePoint = { x: number; y: number; toNext: EdgeKind | null };
type TraceFacet = { pitchRise: number; points: TracePoint[] };

function asUnit(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(1, Math.max(0, number));
}

function parseTraceFacets(trace: unknown): TraceFacet[] {
  const root =
    trace && typeof trace === "object" && !Array.isArray(trace)
      ? (trace as Record<string, unknown>).facets
      : trace;
  if (!Array.isArray(root)) return [];
  const facets: TraceFacet[] = [];
  for (const item of root) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const rawPoints = Array.isArray(row.points) ? row.points : [];
    const points: TracePoint[] = [];
    for (const point of rawPoints) {
      if (!point || typeof point !== "object") continue;
      const cell = point as Record<string, unknown>;
      const x = asUnit(cell.x);
      const y = asUnit(cell.y);
      if (x == null || y == null) continue;
      points.push({ x, y, toNext: isEdgeKind(cell.toNext) ? cell.toNext : null });
    }
    if (points.length < 3) continue;
    const rise = typeof row.pitchRise === "number" ? row.pitchRise : Number(row.pitchRise);
    facets.push({ pitchRise: nearestPitch(rise), points });
  }
  return facets;
}

/**
 * Turn a model trace into a drawing. Coordinates are fractions of the image.
 * Lengths are not taken from the model — only the corners, pitches, and edge labels.
 */
export function drawingFromRoofTrace(input: {
  trace: unknown;
  imageWidth: number;
  imageHeight: number;
  feetPerPixel: number;
}): RoofDrawing {
  const width = input.imageWidth > 0 ? input.imageWidth : SATELLITE_CSS_SIZE * SATELLITE_SCALE;
  const height = input.imageHeight > 0 ? input.imageHeight : SATELLITE_CSS_SIZE * SATELLITE_SCALE;
  const scale = input.feetPerPixel > 0 ? input.feetPerPixel : null;
  const snap = Math.max(8, width * 0.012);
  const minArea = width * height * 0.002;
  const canon: Array<{ id: string; x: number; y: number }> = [];
  const wanted = new Map<string, EdgeKind>();

  function takePoint(x: number, y: number) {
    let best: { id: string; x: number; y: number } | null = null;
    let bestDist = snap;
    for (const point of canon) {
      const dist = Math.hypot(point.x - x, point.y - y);
      if (dist <= bestDist) {
        best = point;
        bestDist = dist;
      }
    }
    if (best) return best.id;
    const id = `p_${canon.length + 1}`;
    canon.push({ id, x, y });
    return id;
  }

  function prefer(key: string, kind: EdgeKind) {
    const current = wanted.get(key);
    if (!current || EDGE_PRIORITY[kind] > EDGE_PRIORITY[current]) wanted.set(key, kind);
  }

  const parsed = parseTraceFacets(input.trace)
    .map((facet) => {
      const ids: string[] = [];
      const kinds: Array<EdgeKind | null> = [];
      for (const point of facet.points) {
        ids.push(takePoint(point.x * width, point.y * height));
        kinds.push(point.toNext);
      }
      const unique = new Set(ids);
      if (unique.size < 3) return null;
      const polygon = ids.map((id) => canon.find((point) => point.id === id)).filter((point) => point != null);
      if (polygonAreaPx(polygon) < minArea) return null;
      return { pitchRise: facet.pitchRise, ids, kinds };
    })
    .filter((facet) => facet != null)
    .sort((a, b) => {
      const area = (facet: { ids: string[] }) =>
        polygonAreaPx(
          facet.ids.map((id) => canon.find((point) => point.id === id)).filter((point) => point != null),
        );
      return area(b) - area(a);
    })
    .slice(0, 12);

  let drawing = emptyDrawing();
  drawing = { ...drawing, feetPerPixel: scale, points: canon.map((point) => ({ ...point })) };
  for (const facet of parsed) {
    for (let index = 0; index < facet.ids.length; index += 1) {
      const kind = facet.kinds[index];
      if (!kind) continue;
      prefer(edgeKey(facet.ids[index], facet.ids[(index + 1) % facet.ids.length]), kind);
    }
    const before = drawing.facets.length;
    drawing = addFacet(drawing, facet.ids);
    const added = drawing.facets[drawing.facets.length - 1];
    if (added && drawing.facets.length > before) {
      drawing = {
        ...drawing,
        facets: drawing.facets.map((item) =>
          item.id === added.id ? { ...item, pitchRise: facet.pitchRise } : item,
        ),
      };
    }
  }

  const used = new Set(drawing.facets.flatMap((facet) => facet.pointIds));
  drawing = { ...drawing, points: drawing.points.filter((point) => used.has(point.id)) };

  for (const edge of drawing.edges) {
    const kind = wanted.get(edgeKey(edge.a, edge.b));
    if (kind && EDGE_PRIORITY[kind] > EDGE_PRIORITY[edge.kind]) {
      drawing = setEdgeKind(drawing, edge.id, kind);
    }
  }

  if (drawing.facets.length) {
    drawing = setWastePercent(drawing, suggestedWastePercent(drawing));
  }
  return drawing;
}
