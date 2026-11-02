import { asGeometry, decimateGeometry } from "./geometry.ts";
import type { Ring, WeatherGeometry } from "./types.ts";

/** County UGC, for example TXC439. Forecast zones (TXZ) are not counties. */
const COUNTY_UGC = /^[A-Z]{2}C\d{3}$/;
const COUNTY_URL = /\/([A-Z]{2}C\d{3})$/;

export function countyUgcs(properties: Record<string, unknown>): string[] {
  const found = new Set<string>();
  const geocode = record(properties.geocode);
  const raw = geocode.UGC ?? geocode.ugc;
  const listed = Array.isArray(raw) ? raw : raw == null || raw === "" ? [] : [raw];
  for (const item of listed) addCounty(found, item);
  const zones = properties.affectedZones;
  if (Array.isArray(zones)) {
    for (const zone of zones) addCounty(found, zone);
  }
  return [...found];
}

export function mergeGeometries(parts: WeatherGeometry[]): WeatherGeometry | null {
  const polygons: Ring[][] = [];
  for (const part of parts) {
    if (part.type === "Polygon") polygons.push(part.coordinates);
    else polygons.push(...part.coordinates);
  }
  if (!polygons.length) return null;
  if (polygons.length === 1) {
    const only = polygons[0];
    if (!only) return null;
    return { type: "Polygon", coordinates: only };
  }
  return { type: "MultiPolygon", coordinates: polygons };
}

export function geometryFromZone(json: unknown): WeatherGeometry | null {
  if (!json || typeof json !== "object") return null;
  const row = json as { type?: string; geometry?: unknown; features?: unknown };
  const direct = asGeometry(row.geometry);
  if (direct) return decimateGeometry(direct, 200);
  if (!Array.isArray(row.features)) return null;
  const parts: WeatherGeometry[] = [];
  for (const feature of row.features) {
    if (!feature || typeof feature !== "object") continue;
    const geometry = asGeometry((feature as { geometry?: unknown }).geometry);
    if (geometry) parts.push(decimateGeometry(geometry, 200));
  }
  return mergeGeometries(parts);
}

function addCounty(found: Set<string>, value: unknown) {
  const text = String(value ?? "").trim().toUpperCase();
  if (COUNTY_UGC.test(text)) {
    found.add(text);
    return;
  }
  const tail = text.match(COUNTY_URL);
  if (tail?.[1]) found.add(tail[1]);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
