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
