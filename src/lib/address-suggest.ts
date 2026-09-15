export type SuggestedAddress = {
  id: string;
  label: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
};

export type AddressSuggestInput = {
  query: string;
  city?: string;
  state?: string;
};

export const MIN_ADDRESS_QUERY_LENGTH = 4;

const STATE_BY_NAME: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

const STATE_NAME_BY_CODE = Object.fromEntries(
  Object.entries(STATE_BY_NAME).map(([name, code]) => [code, name.replace(/\b\w/g, (ch) => ch.toUpperCase())]),
) as Record<string, string>;

/** left, top, right, bottom — Nominatim viewbox. */
const TEXAS_VIEWBOX = "-106.65,36.50,-93.51,25.84";

export type NominatimHit = {
  place_id?: number | string;
  display_name?: string;
  addresstype?: string;
  address?: {
    house_number?: string;
    road?: string;
    pedestrian?: string;
    residential?: string;
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    municipality?: string;
    county?: string;
    state?: string;
    "ISO3166-2-lvl4"?: string;
    postcode?: string;
    country_code?: string;
  };
};

export type GooglePlacePrediction = {
  placeId?: string;
  text?: { text?: string };
  structuredFormat?: {
    mainText?: { text?: string };
    secondaryText?: { text?: string };
  };
};

export function normalizeState(value?: string | null) {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  return STATE_BY_NAME[raw.toLowerCase()] ?? raw.slice(0, 2).toUpperCase();
}

export function lookupQuery(street: string, bias?: { city?: string; state?: string }) {
  const parts = [street.trim()];
  const city = bias?.city?.trim() ?? "";
  const state = normalizeState(bias?.state);
  const haystack = street.toLowerCase();
  if (city && !haystack.includes(city.toLowerCase())) parts.push(city);
  if (state && !queryHasState(haystack, state)) parts.push(state);
  return parts.filter(Boolean).join(", ");
}

export function shouldSuggestAddress(query: string) {
  return query.trim().length >= MIN_ADDRESS_QUERY_LENGTH;
}

export function suggestionFromNominatim(row: NominatimHit): SuggestedAddress | null {
  const address = row.address;
  if (!address || (address.country_code && address.country_code.toLowerCase() !== "us")) return null;
  const road = address.road || address.pedestrian || address.residential || "";
  const street = [address.house_number, road].filter(Boolean).join(" ").trim();
  const city = address.city || address.town || address.village || address.hamlet || address.municipality || "";
  const state = stateFromNominatim(address);
  const postalCode = (address.postcode ?? "").split(";")[0]?.trim() ?? "";
  if (!street && !city) return null;
  const label =
    [street, [city, state].filter(Boolean).join(", "), postalCode].filter(Boolean).join(", ") ||
    row.display_name ||
    street;
  return {
    id: String(row.place_id ?? label),
    label,
    street,
    city,
    state,
    postalCode,
  };
}

export function suggestionFromFormattedAddress(
  id: string,
  formatted: string,
  mainText?: string,
): SuggestedAddress | null {
  const cleaned = formatted
    .replace(/,?\s*(United States|USA|US)\s*$/i, "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (cleaned.length === 0) return null;

  let postalCode = "";
  let state = "";
  const last = cleaned[cleaned.length - 1] ?? "";
  const stateZip = last.match(/^([A-Za-z]{2}|[A-Za-z][A-Za-z .]+)\s+(\d{5}(?:-\d{4})?)$/);
  if (stateZip) {
    state = normalizeState(stateZip[1]);
    postalCode = stateZip[2];
    cleaned.pop();
  } else if (normalizeState(last).length === 2 && /^[A-Za-z]/.test(last)) {
    state = normalizeState(last);
    cleaned.pop();
  }

  const street = (mainText?.trim() || cleaned[0] || "").trim();
  if (cleaned[0] && cleaned[0].toLowerCase() === street.toLowerCase()) cleaned.shift();
  const city = cleaned.join(", ").trim();
  if (!street && !city) return null;
  const label = [street, [city, state].filter(Boolean).join(", "), postalCode].filter(Boolean).join(", ");
  return { id, label, street, city, state, postalCode };
}

export function suggestionFromGooglePrediction(row: GooglePlacePrediction): SuggestedAddress | null {
  const formatted = row.text?.text?.trim() || "";
  const main = row.structuredFormat?.mainText?.text?.trim();
  const id = row.placeId || formatted || main || "";
  if (!id) return null;
  return suggestionFromFormattedAddress(id, formatted || [main, row.structuredFormat?.secondaryText?.text].filter(Boolean).join(", "), main);
}

export function nominatimSearchUrl(query: string, state?: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "6");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("q", query);
  if (normalizeState(state) === "TX") {
    url.searchParams.set("viewbox", TEXAS_VIEWBOX);
    url.searchParams.set("bounded", "0");
  }
  return url;
}

export function rankSuggestions(rows: SuggestedAddress[]) {
  const seen = new Set<string>();
  return rows
    .filter((row) => {
      const key = `${row.street}|${row.city}|${row.state}|${row.postalCode}`.toLowerCase();
      if (!row.street || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => score(right) - score(left));
}

function score(row: SuggestedAddress) {
  return (/\d/.test(row.street) ? 4 : 0) + (row.city ? 2 : 0) + (row.postalCode ? 1 : 0) + (row.state ? 1 : 0);
}

function stateFromNominatim(address: NonNullable<NominatimHit["address"]>) {
  const iso = address["ISO3166-2-lvl4"] ?? "";
  if (iso.startsWith("US-")) return iso.slice(3);
  return normalizeState(address.state);
}

function queryHasState(haystack: string, state: string) {
  const code = normalizeState(state).toLowerCase();
  const name = (STATE_NAME_BY_CODE[normalizeState(state)] ?? "").toLowerCase();
  if (!code) return false;
  if (haystack.includes(`, ${code}`) || haystack.endsWith(` ${code}`) || haystack.endsWith(`,${code}`)) return true;
  return Boolean(name && haystack.includes(name));
}
