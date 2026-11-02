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

export type ReverseHit = {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  label: string;
};

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

const reverseCache = new Map<string, { at: number; ttl: number; hit: ReverseHit | null }>();

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseHit | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const cached = reverseCache.get(key);
  if (cached && Date.now() - cached.at < cached.ttl) return cached.hit;

  let hit: ReverseHit | null = null;
  if (googleMapsApiKey()) {
    try {
      hit = await reverseFromGoogle(lat, lng);
    } catch {
      hit = null;
    }
  }
  if (!hit) {
    try {
      hit = await reverseFromNominatim(lat, lng);
    } catch {
      hit = null;
    }
  }
  reverseCache.set(key, { at: Date.now(), ttl: hit ? HIT_TTL_MS : MISS_TTL_MS, hit });
  if (reverseCache.size > CACHE_LIMIT) {
    const first = reverseCache.keys().next().value;
    if (first) reverseCache.delete(first);
  }
  return hit;
}

async function reverseFromGoogle(lat: number, lng: number): Promise<ReverseHit | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("key", googleMapsApiKey());
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Google reverse geocode ${response.status}`);
  const json = (await response.json()) as {
    results?: { formatted_address?: string; address_components?: { long_name?: string; short_name?: string; types?: string[] }[] }[];
  };
  const result = json.results?.[0];
  if (!result) return null;
  const part = (type: string, short = false) => {
    const row = result.address_components?.find((item) => item.types?.includes(type));
    return (short ? row?.short_name : row?.long_name)?.trim() ?? "";
  };
  const street = [part("street_number"), part("route")].filter(Boolean).join(" ");
  const city = part("locality") || part("postal_town") || part("sublocality");
  const state = part("administrative_area_level_1", true);
  const postalCode = part("postal_code");
  const label = result.formatted_address?.trim() || [street, city, state, postalCode].filter(Boolean).join(", ");
  if (!label) return null;
  return { street, city, state, postalCode, label };
}

async function reverseFromNominatim(lat: number, lng: number): Promise<ReverseHit | null> {
  return enqueueNominatim(async () => {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("addressdetails", "1");
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "TrussCRM/1.0 (job-site geocode; https://trockroofer.com)",
      },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const json = (await response.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };
    const address = json.address ?? {};
    const street = [address.house_number, address.road].filter(Boolean).join(" ");
    const city = address.city || address.town || address.village || address.hamlet || "";
    const iso = address["ISO3166-2-lvl4"] || "";
    const state = iso.startsWith("US-") ? iso.slice(3) : address.state_code || address.state || "";
    const postalCode = address.postcode || "";
    const label = json.display_name?.trim() || [street, city, state, postalCode].filter(Boolean).join(", ");
    if (!label) return null;
    return { street, city, state, postalCode, label };
  });
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
