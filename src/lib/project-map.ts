import type { Job, Opportunity } from "@/lib/types";
import { WORK_COLUMN_LABELS, workColumnFor, type WorkColumn } from "@/lib/work-board";

export {
  PROJECT_MAP_CENTER,
  CREW_LIVE_MS,
  CREW_STALE_MS,
  GEOCODE_BATCH,
  jobSiteQuery,
  projectYear,
  projectYears,
  jobMatchesProjectYear,
  jobHasCoords,
  addressNeedsGeocode,
  crewFreshness,
  visibleCrew,
  parseMapYear,
  isValidLatLng,
  parsePresenceBody,
  type CrewFreshness,
  type MapCrewPing,
} from "./project-map-logic";

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
