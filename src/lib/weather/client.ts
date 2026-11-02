import type { HailPopupHit } from "@/lib/weather/hail-point";
import type { HailStorm } from "@/lib/weather/sample-storms";
import type { BBox, StormLayers, StormPoint } from "@/lib/weather/types";

const CACHE_MS = 3 * 60 * 1000;
let cache: { key: string; at: number; value: StormLayers } | null = null;
let pending: { key: string; promise: Promise<StormLayers> } | null = null;

export function swathUrl(bounds: BBox, product: "mesh" | "rotation" = "mesh") {
  const params = new URLSearchParams({
    west: String(bounds.west),
    south: String(bounds.south),
    east: String(bounds.east),
    north: String(bounds.north),
    product,
  });
  return `/api/weather/swath?${params.toString()}`;
}

export function loadStormLayers(points: StormPoint[], states: string[], force = false) {
  const key = `${states.map((state) => state.toUpperCase()).sort().join(",")}|${points
    .map((point) => `${point.id}:${point.lat.toFixed(2)}:${point.lng.toFixed(2)}`)
    .join(";")}`;
  if (!force && cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache.value);
  if (!force && pending?.key === key) return pending.promise;
  const promise = fetch("/api/weather/picture", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ points, states }),
  })
    .then(async (response) => {
      const body = (await response.json()) as StormLayers & { error?: string };
      if (!response.ok) throw new Error(body.error || "The storm picture did not load.");
      cache = { key, at: Date.now(), value: body };
      return body;
    })
    .finally(() => {
      if (pending?.key === key) pending = null;
    });
  pending = { key, promise };
  return promise;
}

export async function loadHailSwaths() {
  const response = await fetch("/api/weather/swaths");
  const body = (await response.json()) as { source?: "database" | "sample"; storms?: HailStorm[]; error?: string };
  if (!response.ok) throw new Error(body.error || "The hail swaths did not load.");
  return { source: body.source ?? "sample", storms: body.storms ?? [] };
}

export async function loadHailPoint(lat: number, lng: number) {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng), since: "90" });
  const response = await fetch(`/api/weather/point?${params.toString()}`);
  const body = (await response.json()) as { source?: "database" | "sample"; hits?: HailPopupHit[]; error?: string };
  if (!response.ok) throw new Error(body.error || "The hail lookup did not finish.");
  return { source: body.source ?? "sample", hits: body.hits ?? [] };
}

export type RadarCellReading = {
  active: boolean;
  approximate?: boolean;
  dbz?: number;
  category?: string;
  hailChance?: string;
  radarSite?: string;
  error?: string;
};

export async function loadRadarCell(lat: number, lng: number, zoom: number) {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    zoom: String(Math.round(zoom)),
  });
  const response = await fetch(`/api/weather/radar-cell?${params.toString()}`);
  const body = (await response.json()) as RadarCellReading;
  if (!response.ok) throw new Error(body.error || "The radar cell did not load.");
  return body;
}

export async function sendStormTexts() {
  const response = await fetch("/api/weather/notify", { method: "POST" });
  const body = (await response.json()) as { error?: string; texts?: number; mocked?: number; skipped?: string };
  if (!response.ok) throw new Error(body.error || "The storm text did not send.");
  return body;
}
