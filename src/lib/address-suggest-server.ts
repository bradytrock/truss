import {
  lookupQuery,
  nominatimSearchUrl,
  rankSuggestions,
  shouldSuggestAddress,
  suggestionFromGooglePrediction,
  suggestionFromNominatim,
  type AddressSuggestInput,
  type GooglePlacePrediction,
  type NominatimHit,
  type SuggestedAddress,
} from "@/lib/address-suggest";

const HIT_TTL_MS = 15 * 60 * 1000;
const MISS_TTL_MS = 60 * 1000;
const NOMINATIM_GAP_MS = 1100;
const CACHE_LIMIT = 200;

type CacheRow = { at: number; ttl: number; suggestions: SuggestedAddress[] };

const cache = new Map<string, CacheRow>();
let nominatimTail = Promise.resolve();
let nominatimLastAt = 0;

export function googleMapsApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || "";
}

export async function suggestAddresses(input: AddressSuggestInput): Promise<SuggestedAddress[]> {
  const query = lookupQuery(input.query, { city: input.city, state: input.state });
  if (!shouldSuggestAddress(input.query.trim())) return [];

  const key = query.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < cached.ttl) return cached.suggestions;

  let suggestions: SuggestedAddress[] = [];
  if (googleMapsApiKey()) {
    try {
      suggestions = await suggestFromGoogle(query, input.state);
    } catch {
      suggestions = [];
    }
  }
  if (suggestions.length === 0) {
    suggestions = await suggestFromNominatim(query, input.state);
  }

  remember(key, suggestions);
  return suggestions;
}

async function suggestFromGoogle(query: string, state?: string): Promise<SuggestedAddress[]> {
  const key = googleMapsApiKey();
  const body: Record<string, unknown> = {
    input: query,
    includedRegionCodes: ["us"],
    includedPrimaryTypes: ["street_address", "premise", "subpremise", "route"],
  };
  if ((state ?? "").trim().toUpperCase() === "TX" || !state?.trim()) {
    body.locationBias = {
      rectangle: {
        low: { latitude: 25.84, longitude: -106.65 },
        high: { latitude: 36.5, longitude: -93.51 },
      },
    };
  }

  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Google Places ${response.status}`);
  const json = (await response.json()) as {
    suggestions?: { placePrediction?: GooglePlacePrediction }[];
  };
  return rankSuggestions(
    (json.suggestions ?? [])
      .map((row) => suggestionFromGooglePrediction(row.placePrediction ?? {}))
      .filter((row): row is SuggestedAddress => Boolean(row)),
  );
}

async function suggestFromNominatim(query: string, state?: string): Promise<SuggestedAddress[]> {
  const rows = await enqueueNominatim(async () => {
    const response = await fetch(nominatimSearchUrl(query, state), {
      headers: {
        Accept: "application/json",
        "User-Agent": "TrussCRM/1.0 (job-site address lookup; https://trockroofer.com)",
      },
      cache: "no-store",
    });
    if (!response.ok) return [];
    const json = (await response.json()) as NominatimHit[];
    return Array.isArray(json) ? json : [];
  });
  return rankSuggestions(rows.map(suggestionFromNominatim).filter((row): row is SuggestedAddress => Boolean(row)));
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

function remember(key: string, suggestions: SuggestedAddress[]) {
  cache.set(key, {
    at: Date.now(),
    ttl: suggestions.length > 0 ? HIT_TTL_MS : MISS_TTL_MS,
    suggestions,
  });
  if (cache.size <= CACHE_LIMIT) return;
  const first = cache.keys().next().value;
  if (first) cache.delete(first);
}
