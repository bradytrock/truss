export const PROJECT_MAP_CENTER = { lat: 32.7767, lng: -96.797 } as const;
export const CREW_LIVE_MS = 15 * 60 * 1000;
export const CREW_STALE_MS = 60 * 60 * 1000;
export const GEOCODE_BATCH = 8;

export type CrewFreshness = "live" | "stale" | "gone";

export type MapCrewPing = {
  staffId: string;
  name: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  heading: number | null;
  updatedAt: string;
};

export function jobSiteQuery(job: {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  location?: string;
}) {
  const street = job.street?.trim() ?? "";
  const city = job.city?.trim() ?? "";
  const state = job.state?.trim() ?? "";
  const postal = job.postalCode?.trim() ?? "";
  const cityState = [city, state].filter(Boolean).join(", ");
  const locality = [cityState, postal].filter(Boolean).join(" ");
  return [street, locality].filter(Boolean).join(", ") || (job.location ?? "").trim();
}

export function projectYear(
  job: { startDate?: string; code?: string },
  fallbackYear?: number | null,
): number | null {
  const start = job.startDate?.trim() ?? "";
  if (start) {
    const year = Number(start.slice(0, 4));
    if (year >= 2000 && year <= 2100) return year;
  }
  const fromCode = yearFromJobCode(job.code ?? "");
  if (fromCode) return fromCode;
  if (fallbackYear && fallbackYear >= 2000 && fallbackYear <= 2100) return fallbackYear;
  return null;
}

export function projectYears(jobs: Array<{ startDate?: string; code?: string }>, now = new Date()) {
  const years = new Set<number>();
  years.add(now.getFullYear());
  for (const job of jobs) {
    const year = projectYear(job);
    if (year) years.add(year);
  }
  return [...years].sort((left, right) => right - left);
}

export function jobMatchesProjectYear(
  job: { startDate?: string; code?: string },
  year: number | "all",
) {
  if (year === "all") return true;
  return projectYear(job) === year;
}

export function jobHasCoords(job: { lat?: number | null; lng?: number | null }) {
  return Number.isFinite(job.lat) && Number.isFinite(job.lng);
}

export function addressNeedsGeocode(job: {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  location?: string;
  lat?: number | null;
  lng?: number | null;
  geocodeQuery?: string;
}) {
  const query = jobSiteQuery(job);
  if (!query) return false;
  if (!jobHasCoords(job)) return true;
  return (job.geocodeQuery ?? "").trim().toLowerCase() !== query.toLowerCase();
}

export function crewFreshness(updatedAt: string, now = Date.now()): CrewFreshness {
  const at = Date.parse(updatedAt);
  if (!Number.isFinite(at)) return "gone";
  const age = now - at;
  if (age <= CREW_LIVE_MS) return "live";
  if (age <= CREW_STALE_MS) return "stale";
  return "gone";
}

export function visibleCrew(rows: MapCrewPing[], now = Date.now()) {
  return rows.filter((row) => crewFreshness(row.updatedAt, now) !== "gone");
}

export function parseMapYear(raw: string | null, years: readonly number[]): number | "all" {
  if (raw === "all") return "all";
  const year = Number(raw);
  if (years.includes(year)) return year;
  return years[0] ?? new Date().getFullYear();
}

/** Same stamp as `parseJobCodeDate` in job-code.ts: BJ081926-A → 2026. */
function yearFromJobCode(code: string): number | null {
  const match = /^[A-Za-z]{1,4}(\d{6})-/.exec(code.trim());
  if (!match) return null;
  const stamp = match[1] ?? "";
  const month = Number(stamp.slice(0, 2));
  const day = Number(stamp.slice(2, 4));
  const year = Number(stamp.slice(4, 6));
  if (!month || month > 12 || !day || day > 31) return null;
  return 2000 + year;
}

export function isValidLatLng(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function crewMapLabel(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(" ") || "Crew";
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

export function jobMatchesMapSearch(
  job: { name?: string; code?: string; street?: string; city?: string; state?: string; location?: string },
  query: string,
  extras: string[] = [],
) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [job.name, job.code, job.street, job.city, job.state, job.location, ...extras]
    .filter((part) => typeof part === "string" && part.trim())
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function clusterCellDegrees(zoom: number) {
  if (zoom >= 15) return 0;
  if (zoom >= 13) return 0.003;
  if (zoom >= 11) return 0.012;
  if (zoom >= 9) return 0.04;
  return 0.1;
}

export type MapPinCluster = {
  id: string;
  lat: number;
  lng: number;
  jobIds: string[];
};

export function clusterJobPins(
  pins: Array<{ id: string; lat: number; lng: number }>,
  zoom: number,
): MapPinCluster[] {
  const cell = clusterCellDegrees(zoom);
  if (cell <= 0) {
    return pins.map((pin) => ({ id: pin.id, lat: pin.lat, lng: pin.lng, jobIds: [pin.id] }));
  }
  const buckets = new Map<string, MapPinCluster>();
  for (const pin of pins) {
    const key = `${Math.round(pin.lng / cell)}:${Math.round(pin.lat / cell)}`;
    const bucket = buckets.get(key);
    if (!bucket) {
      buckets.set(key, { id: pin.id, lat: pin.lat, lng: pin.lng, jobIds: [pin.id] });
      continue;
    }
    bucket.jobIds.push(pin.id);
    const n = bucket.jobIds.length;
    bucket.lat = (bucket.lat * (n - 1) + pin.lat) / n;
    bucket.lng = (bucket.lng * (n - 1) + pin.lng) / n;
    bucket.id = `cluster:${key}`;
  }
  return [...buckets.values()];
}

export function parsePresenceBody(body: Record<string, unknown>) {
  const lat = typeof body.lat === "number" ? body.lat : Number(body.lat);
  const lng = typeof body.lng === "number" ? body.lng : Number(body.lng);
  if (!isValidLatLng(lat, lng)) return { error: "Need a valid latitude and longitude." as const };
  const accuracy =
    body.accuracy == null || body.accuracy === ""
      ? null
      : Number(body.accuracy);
  const heading =
    body.heading == null || body.heading === ""
      ? null
      : Number(body.heading);
  return {
    lat,
    lng,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    heading: Number.isFinite(heading) ? heading : null,
  };
}

/** W3C GeolocationPositionError codes. */
export const GEO_PERMISSION_DENIED = 1;
export const GEO_POSITION_UNAVAILABLE = 2;
export const GEO_TIMEOUT = 3;

/** First watch: GPS when the device has it. Timeout is long so a laptop Wi‑Fi fix can still land. */
export const GEO_WATCH_PRECISE = {
  enableHighAccuracy: true,
  maximumAge: 15000,
  timeout: 45000,
} as const;

/** Fallback after timeout / unavailable — network / IP location on a desk browser. */
export const GEO_WATCH_COARSE = {
  enableHighAccuracy: false,
  maximumAge: 60000,
  timeout: 60000,
} as const;

export const PRESENCE_POST_MIN_MS = 10_000;

export function shouldStopSharingOnGeoError(code: number | undefined) {
  return code === GEO_PERMISSION_DENIED;
}

export function geoShareErrorMessage(input: {
  code?: number;
  insecure?: boolean;
  unsupported?: boolean;
}) {
  if (input.unsupported) return "This browser cannot share a location.";
  if (input.insecure) {
    return "Location needs a secure (https) page. Open the live site, not a local http tab.";
  }
  if (input.code === GEO_PERMISSION_DENIED) {
    return "Location was blocked. Allow it in the browser, or ping from the phone.";
  }
  if (input.code === GEO_TIMEOUT) {
    return "Location is taking longer than usual. Trying a less precise fix.";
  }
  if (input.code === GEO_POSITION_UNAVAILABLE) {
    return "Could not find a precise position. Trying again with network location.";
  }
  return "Could not read your location yet. Still trying.";
}

export function shouldPostPresence(lastPostedAt: number | null, now: number, minMs = PRESENCE_POST_MIN_MS) {
  if (lastPostedAt == null) return true;
  return now - lastPostedAt >= minMs;
}

export function mergeCrewPing(rows: MapCrewPing[], ping: MapCrewPing): MapCrewPing[] {
  return [...rows.filter((row) => row.staffId !== ping.staffId), ping];
}

/** Keep a just-shared ping if the poll is older or missing that seat. */
export function preferFresherPing(rows: MapCrewPing[], ping: MapCrewPing | null | undefined): MapCrewPing[] {
  if (!ping) return rows;
  const existing = rows.find((row) => row.staffId === ping.staffId);
  if (existing && Date.parse(existing.updatedAt) >= Date.parse(ping.updatedAt)) return rows;
  return mergeCrewPing(rows, ping);
}

/** Reports scope plus the signed-in seat, so Login As still shows your own live pin. */
export function staffIdsForLiveMap(
  scopedIds: readonly string[],
  selfIds: readonly (string | null | undefined)[],
) {
  const next = new Set(scopedIds.filter(Boolean));
  for (const id of selfIds) {
    if (id) next.add(id);
  }
  return next;
}

export function resolveSeatStaffId(input: {
  profileStaffId?: string | null;
  email?: string | null;
  fullName?: string | null;
  roster?: Array<{ id: string; name?: string | null; email?: string | null }>;
}) {
  const linked = input.profileStaffId?.trim() ?? "";
  if (linked) return linked;
  const roster = input.roster ?? [];
  const email = input.email?.trim().toLowerCase() ?? "";
  if (email) {
    const byEmail = roster.find((row) => (row.email ?? "").trim().toLowerCase() === email);
    if (byEmail) return byEmail.id;
  }
  const name = input.fullName?.trim().toLowerCase() ?? "";
  if (name) {
    const byName = roster.find((row) => (row.name ?? "").trim().toLowerCase() === name);
    if (byName) return byName.id;
  }
  return "";
}
