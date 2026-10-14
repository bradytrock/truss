/** In-house roof drawing. Points are pixels on the aerial. Lengths and areas are computed from those pixels and a scale. */

export const EDGE_KINDS = [
  "ridge",
  "hip",
  "valley",
  "eave",
  "rake",
  "drip",
  "flashing",
  "step_flashing",
  "parapet",
] as const;

export type EdgeKind = (typeof EDGE_KINDS)[number];

export const EDGE_KIND_LABELS: Record<EdgeKind, string> = {
  ridge: "Ridge",
  hip: "Hip",
  valley: "Valley",
  eave: "Eave",
  rake: "Rake",
  drip: "Drip edge",
  flashing: "Flashing",
  step_flashing: "Step flashing",
  parapet: "Parapet",
};

/** Screen color for each edge. White halo is drawn under the stroke. */
export const EDGE_COLORS: Record<EdgeKind, string> = {
  ridge: "#dc2626",
  hip: "#16a34a",
  valley: "#2563eb",
  eave: "#171717",
  rake: "#9333ea",
  drip: "#0f766e",
  flashing: "#ca8a04",
  step_flashing: "#c2410c",
  parapet: "#64748b",
};

/** Edges that run up the slope. Their drawn length is stretched by pitch. */
const SLOPED_KINDS = new Set<EdgeKind>(["hip", "valley", "rake", "step_flashing"]);

export const PITCH_RISES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18] as const;

export type RoofPoint = { id: string; x: number; y: number };

export type RoofEdge = { id: string; a: string; b: string; kind: EdgeKind };

export type RoofFacet = { id: string; pointIds: string[]; pitchRise: number };

export type RoofDrawing = {
  points: RoofPoint[];
  edges: RoofEdge[];
  facets: RoofFacet[];
  /** Feet per image pixel. Null until the estimator sets a known length. */
  feetPerPixel: number | null;
  wastePercent: number;
};

export type RoofLengths = Record<EdgeKind, number>;

export type RoofTotals = {
  calibrated: boolean;
  planSqFt: number;
  surfaceSqFt: number;
  squares: number;
  suggestedSquares: number;
  facetCount: number;
  predominantPitch: string;
  lengths: RoofLengths;
};

export type RoofHit =
  | { kind: "point"; id: string }
  | { kind: "edge"; id: string }
  | { kind: "facet"; id: string };

const EMPTY_LENGTHS = Object.fromEntries(EDGE_KINDS.map((kind) => [kind, 0])) as RoofLengths;

export function emptyDrawing(): RoofDrawing {
  return {
    points: [],
    edges: [],
    facets: [],
    feetPerPixel: null,
    wastePercent: 15,
  };
}

export function roofId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function edgeKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function pitchLabel(rise: number) {
  const whole = Number.isFinite(rise) ? Math.round(rise) : 0;
  return `${whole}/12`;
}

export function slopeFactor(rise: number) {
  const safe = Number.isFinite(rise) ? Math.max(0, rise) : 0;
  return 1 / Math.cos(Math.atan(safe / 12));
}

export function formatFeet(value: number) {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} ft`;
}

export function formatSquares(value: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function roundTo(value: number, places: number) {
  const m = 10 ** places;
  return Math.round(value * m) / m;
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function polygonAreaPx(points: Array<{ x: number; y: number }>) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    sum += points[i].x * next.y - next.x * points[i].y;
  }
  return Math.abs(sum) / 2;
}

export function polygonCentroid(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return { x: 0, y: 0 };
  const area = polygonAreaPx(points);
  if (area === 0) {
    const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    return { x, y };
  }
  let x = 0;
  let y = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    const cross = points[i].x * next.y - next.x * points[i].y;
    x += (points[i].x + next.x) * cross;
    y += (points[i].y + next.y) * cross;
  }
  const factor = 1 / (6 * (polygonAreaSigned(points) || 1));
  return { x: x * factor, y: y * factor };
}

function polygonAreaSigned(points: Array<{ x: number; y: number }>) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    sum += points[i].x * next.y - next.x * points[i].y;
  }
  return sum / 2;
}

function pointById(drawing: RoofDrawing, id: string) {
  return drawing.points.find((point) => point.id === id) ?? null;
}

export function facetPoints(drawing: RoofDrawing, facet: RoofFacet) {
  const points: RoofPoint[] = [];
  for (const id of facet.pointIds) {
    const point = pointById(drawing, id);
    if (point) points.push(point);
  }
  return points;
}

function facetEdgeKeys(facet: RoofFacet) {
  const keys: string[] = [];
  const ids = facet.pointIds;
  for (let i = 0; i < ids.length; i += 1) {
    keys.push(edgeKey(ids[i], ids[(i + 1) % ids.length]));
  }
  return keys;
}

function facetsTouching(drawing: RoofDrawing, edge: RoofEdge) {
  const key = edgeKey(edge.a, edge.b);
  return drawing.facets.filter((facet) => facetEdgeKeys(facet).includes(key));
}

export function addFacet(drawing: RoofDrawing, pointIds: string[]): RoofDrawing {
  if (pointIds.length < 3) return drawing;
  const unique = new Set(pointIds);
  if (unique.size < 3) return drawing;
  const edges = drawing.edges.map((edge) => ({ ...edge }));
  const usage = new Map<string, number>();
  for (const facet of drawing.facets) {
    for (const key of facetEdgeKeys(facet)) usage.set(key, (usage.get(key) ?? 0) + 1);
  }
  for (let i = 0; i < pointIds.length; i += 1) {
    const a = pointIds[i];
    const b = pointIds[(i + 1) % pointIds.length];
    const key = edgeKey(a, b);
    const index = edges.findIndex((edge) => edgeKey(edge.a, edge.b) === key);
    if (index >= 0) {
      const used = usage.get(key) ?? 0;
      const existing = edges[index];
      if (used >= 1 && (existing.kind === "eave" || existing.kind === "rake")) {
        edges[index] = { ...existing, kind: "ridge" };
      }
      usage.set(key, used + 1);
    } else {
      edges.push({ id: roofId("e"), a, b, kind: "eave" });
      usage.set(key, 1);
    }
  }
  return {
    ...drawing,
    edges,
    facets: [...drawing.facets, { id: roofId("f"), pointIds: [...pointIds], pitchRise: 6 }],
  };
}

export function commitFacet(drawing: RoofDrawing, draft: Array<{ x: number; y: number; id?: string }>) {
  if (draft.length < 3) return drawing;
  let next = drawing;
  const ids: string[] = [];
  for (const point of draft) {
    if (point.id && next.points.some((item) => item.id === point.id)) {
      ids.push(point.id);
      continue;
    }
    const id = roofId("p");
    next = { ...next, points: [...next.points, { id, x: point.x, y: point.y }] };
    ids.push(id);
  }
  return addFacet(next, ids);
}

export function removeFacet(drawing: RoofDrawing, facetId: string): RoofDrawing {
  const facets = drawing.facets.filter((facet) => facet.id !== facetId);
  const used = new Set<string>();
  for (const facet of facets) {
    for (const key of facetEdgeKeys(facet)) used.add(key);
  }
  const edges = drawing.edges.filter((edge) => used.has(edgeKey(edge.a, edge.b)));
  const pointIds = new Set(facets.flatMap((facet) => facet.pointIds));
  const points = drawing.points.filter((point) => pointIds.has(point.id));
  return { ...drawing, points, edges, facets };
}

export function movePoint(drawing: RoofDrawing, id: string, x: number, y: number): RoofDrawing {
  return {
    ...drawing,
    points: drawing.points.map((point) => (point.id === id ? { ...point, x, y } : point)),
  };
}

export function setEdgeKind(drawing: RoofDrawing, edgeId: string, kind: EdgeKind): RoofDrawing {
  return {
    ...drawing,
    edges: drawing.edges.map((edge) => (edge.id === edgeId ? { ...edge, kind } : edge)),
  };
}

export function setFacetPitch(drawing: RoofDrawing, facetId: string, pitchRise: number): RoofDrawing {
  const rise = PITCH_RISES.includes(pitchRise as (typeof PITCH_RISES)[number]) ? pitchRise : 6;
  return {
    ...drawing,
    facets: drawing.facets.map((facet) => (facet.id === facetId ? { ...facet, pitchRise: rise } : facet)),
  };
}

export function setWastePercent(drawing: RoofDrawing, wastePercent: number): RoofDrawing {
  const waste = Number.isFinite(wastePercent) ? Math.min(80, Math.max(0, wastePercent)) : drawing.wastePercent;
  return { ...drawing, wastePercent: waste };
}

export function setFeetPerPixel(drawing: RoofDrawing, feetPerPixel: number | null): RoofDrawing {
  if (feetPerPixel == null || !Number.isFinite(feetPerPixel) || feetPerPixel <= 0) {
    return { ...drawing, feetPerPixel: null };
  }
  return { ...drawing, feetPerPixel };
}

export function nearestPoint(drawing: RoofDrawing, x: number, y: number, tolerance: number) {
  let best: RoofPoint | null = null;
  let bestDist = tolerance;
  for (const point of drawing.points) {
    const dist = Math.hypot(point.x - x, point.y - y);
    if (dist <= bestDist) {
      best = point;
      bestDist = dist;
    }
  }
  return best;
}

function distToSegment(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  if (len === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function pointInPolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const intersect =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 1e-9) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function hitTest(drawing: RoofDrawing, x: number, y: number, tolerance: number): RoofHit | null {
  const point = nearestPoint(drawing, x, y, tolerance);
  if (point) return { kind: "point", id: point.id };
  let bestEdge: RoofEdge | null = null;
  let bestDist = tolerance;
  for (const edge of drawing.edges) {
    const a = pointById(drawing, edge.a);
    const b = pointById(drawing, edge.b);
    if (!a || !b) continue;
    const dist = distToSegment({ x, y }, a, b);
    if (dist <= bestDist) {
      bestEdge = edge;
      bestDist = dist;
    }
  }
  if (bestEdge) return { kind: "edge", id: bestEdge.id };
  let bestFacet: RoofFacet | null = null;
  let bestArea = Number.POSITIVE_INFINITY;
  for (const facet of drawing.facets) {
    const polygon = facetPoints(drawing, facet);
    if (!pointInPolygon({ x, y }, polygon)) continue;
    const area = polygonAreaPx(polygon);
    if (area < bestArea) {
      bestFacet = facet;
      bestArea = area;
    }
  }
  return bestFacet ? { kind: "facet", id: bestFacet.id } : null;
}

export function edgeLengthFeet(drawing: RoofDrawing, edge: RoofEdge) {
  return planLengthFeet(drawing, edge);
}

function planLengthFeet(drawing: RoofDrawing, edge: RoofEdge) {
  const scale = drawing.feetPerPixel;
  if (scale == null || scale <= 0) return 0;
  const a = pointById(drawing, edge.a);
  const b = pointById(drawing, edge.b);
  if (!a || !b) return 0;
  const plan = distance(a, b) * scale;
  if (!SLOPED_KINDS.has(edge.kind)) return plan;
  const rises = facetsTouching(drawing, edge).map((facet) => facet.pitchRise);
  const rise = rises.length ? Math.max(...rises) : 0;
  return plan * slopeFactor(rise);
}

export function measureRoof(drawing: RoofDrawing): RoofTotals {
  const calibrated = drawing.feetPerPixel != null && drawing.feetPerPixel > 0;
  const lengths = { ...EMPTY_LENGTHS };
  if (calibrated) {
    for (const edge of drawing.edges) {
      lengths[edge.kind] = roundTo(lengths[edge.kind] + planLengthFeet(drawing, edge), 2);
    }
  }
  let planSqFt = 0;
  let surfaceSqFt = 0;
  let predominantRise = 0;
  let predominantArea = -1;
  for (const facet of drawing.facets) {
    const polygon = facetPoints(drawing, facet);
    const px = polygonAreaPx(polygon);
    const plan = calibrated ? px * (drawing.feetPerPixel ?? 0) ** 2 : 0;
    const surface = plan * slopeFactor(facet.pitchRise);
    planSqFt += plan;
    surfaceSqFt += surface;
    if (surface >= predominantArea) {
      predominantArea = surface;
      predominantRise = facet.pitchRise;
    }
  }
  const squares = calibrated ? surfaceSqFt / 100 : 0;
  const waste = Number.isFinite(drawing.wastePercent) ? drawing.wastePercent : 0;
  return {
    calibrated,
    planSqFt: roundTo(planSqFt, 1),
    surfaceSqFt: roundTo(surfaceSqFt, 1),
    squares: roundTo(squares, 2),
    suggestedSquares: roundTo(squares * (1 + waste / 100), 2),
    facetCount: drawing.facets.length,
    predominantPitch: drawing.facets.length ? pitchLabel(predominantRise) : "—",
    lengths,
  };
}

/** A starting waste percent from how cut up the roof is. The estimator can override it. */
export function suggestedWastePercent(drawing: RoofDrawing) {
  const totals = measureRoof({ ...drawing, wastePercent: 0 });
  const cut = totals.lengths.hip + totals.lengths.valley;
  const level =
    totals.lengths.eave +
    totals.lengths.ridge +
    totals.lengths.rake +
    totals.lengths.drip +
    totals.lengths.parapet;
  const base = cut + level;
  if (!totals.calibrated || base <= 0) return 15;
  const ratio = cut / base;
  return Math.round(Math.min(25, Math.max(10, 8 + ratio * 30)));
}

function isEdgeKind(value: unknown): value is EdgeKind {
  return typeof value === "string" && (EDGE_KINDS as readonly string[]).includes(value);
}

function asPoint(value: unknown): RoofPoint | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const x = typeof row.x === "number" ? row.x : Number(row.x);
  const y = typeof row.y === "number" ? row.y : Number(row.y);
  if (typeof row.id !== "string" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { id: row.id, x, y };
}

function asEdge(value: unknown): RoofEdge | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.a !== "string" || typeof row.b !== "string") return null;
  if (!isEdgeKind(row.kind)) return null;
  return { id: row.id, a: row.a, b: row.b, kind: row.kind };
}

function asFacet(value: unknown): RoofFacet | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !Array.isArray(row.pointIds)) return null;
  const pointIds = row.pointIds.filter((id): id is string => typeof id === "string");
  if (pointIds.length < 3) return null;
  const rise = typeof row.pitchRise === "number" ? row.pitchRise : Number(row.pitchRise);
  return { id: row.id, pointIds, pitchRise: Number.isFinite(rise) ? rise : 6 };
}

export function parseRoofDrawing(value: unknown): RoofDrawing {
  if (!value || typeof value !== "object") return emptyDrawing();
  const row = value as Record<string, unknown>;
  const points = Array.isArray(row.points) ? row.points.map(asPoint).filter((item) => item !== null) : [];
  const edges = Array.isArray(row.edges) ? row.edges.map(asEdge).filter((item) => item !== null) : [];
  const facets = Array.isArray(row.facets) ? row.facets.map(asFacet).filter((item) => item !== null) : [];
  const scaleRaw = row.feetPerPixel ?? row.feet_per_pixel;
  const scale = typeof scaleRaw === "number" ? scaleRaw : Number(scaleRaw);
  const wasteRaw = row.wastePercent ?? row.waste_percent;
  const waste = typeof wasteRaw === "number" ? wasteRaw : Number(wasteRaw);
  return {
    points,
    edges,
    facets,
    feetPerPixel: Number.isFinite(scale) && scale > 0 ? scale : null,
    wastePercent: Number.isFinite(waste) ? Math.min(80, Math.max(0, waste)) : 15,
  };
}
