import { parseJobCodeDate } from "./job-code.ts";
import type { Job, Opportunity } from "./types.ts";
import { WORK_COLUMN_LABELS, workColumnFor, type WorkColumn } from "./work-board.ts";

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

export const PROJECT_PIN_COLORS: Record<WorkColumn, string> = {
  lead: "#3b6fd4",
  estimating: "#6b5ce7",
  proposal_sent: "#c47b2b",
  in_progress: "#1f7a4d",
  punch: "#b45309",
  complete: "#4b5563",
  on_hold: "#6b7280",
  lost: "#9ca3af",
  deleted: "#b91c1c",
};

export function jobSiteQuery(
  job: Pick<Job, "street" | "city" | "state" | "postalCode" | "location">,
) {
  const street = job.street?.trim() ?? "";
  const city = job.city?.trim() ?? "";
  const state = job.state?.trim() ?? "";
  const postal = job.postalCode?.trim() ?? "";
  const cityState = [city, state].filter(Boolean).join(", ");
  const locality = [cityState, postal].filter(Boolean).join(" ");
  return [street, locality].filter(Boolean).join(", ") || job.location.trim();
}

export function projectYear(
  job: Pick<Job, "startDate" | "code">,
  fallbackYear?: number | null,
): number | null {
  const start = job.startDate?.trim() ?? "";
  if (start) {
    const year = Number(start.slice(0, 4));
    if (year >= 2000 && year <= 2100) return year;
  }
  const fromCode = parseJobCodeDate(job.code ?? "");
  if (fromCode) return fromCode.getFullYear();
  if (fallbackYear && fallbackYear >= 2000 && fallbackYear <= 2100) return fallbackYear;
  return null;
}

export function projectYears(jobs: Array<Pick<Job, "startDate" | "code">>, now = new Date()) {
  const years = new Set<number>();
  years.add(now.getFullYear());
  for (const job of jobs) {
    const year = projectYear(job);
    if (year) years.add(year);
  }
  return [...years].sort((left, right) => right - left);
}

export function jobMatchesProjectYear(
  job: Pick<Job, "startDate" | "code">,
  year: number | "all",
) {
  if (year === "all") return true;
  return projectYear(job) === year;
}

export function jobHasCoords(job: Pick<Job, "lat" | "lng">) {
  return Number.isFinite(job.lat) && Number.isFinite(job.lng);
}

export function addressNeedsGeocode(
  job: Pick<Job, "street" | "city" | "state" | "postalCode" | "location" | "lat" | "lng" | "geocodeQuery">,
) {
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

export function workPinColor(
  job: Pick<Job, "status" | "opportunityId" | "deletedAt">,
  opportunity?: Pick<Opportunity, "stage"> | null,
) {
  return PROJECT_PIN_COLORS[workColumnFor(job, opportunity)];
}

export function workPinLabel(
  job: Pick<Job, "status" | "opportunityId" | "deletedAt">,
  opportunity?: Pick<Opportunity, "stage"> | null,
) {
  return WORK_COLUMN_LABELS[workColumnFor(job, opportunity)];
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
