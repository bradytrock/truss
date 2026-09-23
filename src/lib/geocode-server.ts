import { googleMapsApiKey } from "@/lib/address-suggest-server";

const HIT_TTL_MS = 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 30 * 60 * 1000;
const NOMINATIM_GAP_MS = 1100;
const CACHE_LIMIT = 400;

type CacheRow = { at: number; ttl: number; lat: number | null; lng: number | null };
const cache = new Map<string, CacheRow>();
let nominatimTail = Promise.resolve();
let nominatimLastAt = 0;

export type GeocodeHit = { lat: number; lng: number };

export async function geocodeAddress(query: string): Promise<GeocodeHit | null> {
  const key = query.trim().toLowerCase();
  if (!key) return null;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < cached.ttl) {
    return cached.lat != null && cached.lng != null ? { lat: cached.lat, lng: cached.lng } : null;
  }

  let hit: GeocodeHit | null = null;
  if (googleMapsApiKey()) {
    try {
      hit = await geocodeFromGoogle(query);
    } catch {
      hit = null;
    }
  }
  if (!hit) {
    try {
      hit = await geocodeFromNominatim(query);
    } catch {
      hit = null;
    }
  }

  remember(key, hit);
  return hit;
}

async function geocodeFromGoogle(query: string): Promise<GeocodeHit | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("key", googleMapsApiKey());
  url.searchParams.set("region", "us");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Google Geocode ${response.status}`);
  const json = (await response.json()) as {
    status?: string;
    results?: { geometry?: { location?: { lat?: number; lng?: number } } }[];
  };
  const location = json.results?.[0]?.geometry?.location;
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function geocodeFromNominatim(query: string): Promise<GeocodeHit | null> {
  return enqueueNominatim(async () => {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "us");
    url.searchParams.set("q", query);
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "TrussCRM/1.0 (job-site geocode; https://trockroofer.com)",
      },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { lat?: string; lon?: string }[];
    const row = Array.isArray(json) ? json[0] : null;
    const lat = Number(row?.lat);
    const lng = Number(row?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  });
}

function enqueueNominatim<T>(work: () => Promise<T>): Promise<T> {
  const run = nominatimTail.then(async () => {
    const wait = Math.max(0, NOMINATIM_GAP_MS - (Date.now() - nominatimLastAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    nominatimLastAt = Date.now();
    return work();
  });
  nominatimTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function remember(key: string, hit: GeocodeHit | null) {
  cache.set(key, {
    at: Date.now(),
    ttl: hit ? HIT_TTL_MS : MISS_TTL_MS,
    lat: hit?.lat ?? null,
    lng: hit?.lng ?? null,
  });
  if (cache.size <= CACHE_LIMIT) return;
  const first = cache.keys().next().value;
  if (first) cache.delete(first);
}
