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

export async function sendStormTexts() {
  const response = await fetch("/api/weather/notify", { method: "POST" });
  const body = (await response.json()) as { error?: string; texts?: number; mocked?: number; skipped?: string };
  if (!response.ok) throw new Error(body.error || "The storm text did not send.");
  return body;
}
