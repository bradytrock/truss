import { calendarDaysAgo } from "@/lib/format";
import { parseLocation } from "@/lib/job-record";
import type { Job, JobStatus, Opportunity, PipelineStage } from "./types";

export const WORK_COLUMNS = [
  "lead",
  "proposal_sent",
  "in_progress",
  "supplementing",
  "punch",
  "complete",
  "on_hold",
  "unqualified",
  "lost",
  "deleted",
] as const;

export type WorkColumn = (typeof WORK_COLUMNS)[number];

export const WORK_COLUMN_LABELS: Record<WorkColumn, string> = {
  lead: "Lead",
  proposal_sent: "Proposal sent",
  in_progress: "In progress",
  supplementing: "Supplementing",
  punch: "Punch list",
  complete: "Complete",
  on_hold: "On hold",
  unqualified: "Unqualified",
  lost: "Lost",
  deleted: "Deleted",
};

/** Older boards and automations used a separate Estimating column. It is Supplementing now. */
export function canonicalizeWorkColumn(value: string): WorkColumn | null {
  if (value === "estimating") return "supplementing";
  return isWorkColumn(value) ? value : null;
}

export function workColumnFor(
  job: Pick<Job, "status" | "opportunityId" | "deletedAt">,
  opportunity?: Pick<Opportunity, "stage"> | null,
): WorkColumn {
  if (job.deletedAt) return "deleted";
  if (opportunity?.stage === "unqualified") return "unqualified";
  if (opportunity?.stage === "lost") return "lost";
  if (job.status === "complete") return "complete";
  if (job.status === "punch") return "punch";
  if (job.status === "in_progress") return "in_progress";
  if (job.status === "on_hold") return "on_hold";
  if (opportunity?.stage === "awarded") return "in_progress";
  if (opportunity?.stage === "supplementing" || opportunity?.stage === "estimating") return "supplementing";
  if (opportunity?.stage === "bid_submitted" || opportunity?.stage === "interview") return "proposal_sent";
  if (opportunity) return "lead";
  return "in_progress";
}

export function boardValue(
  job: Pick<Job, "contractValue">,
  opportunity?: Pick<Opportunity, "value"> | null,
  signedAmount = 0,
) {
  return job.contractValue || signedAmount || opportunity?.value || 0;
}

export function patchForWorkColumn(column: WorkColumn): {
  status: JobStatus;
  stage: PipelineStage | null;
} {
  switch (column) {
    case "lead":
      return { status: "precon", stage: "pursuing" };
    case "proposal_sent":
      return { status: "precon", stage: "bid_submitted" };
    case "supplementing":
      return { status: "precon", stage: "supplementing" };
    case "in_progress":
      return { status: "in_progress", stage: "awarded" };
    case "punch":
      return { status: "punch", stage: "awarded" };
    case "complete":
      return { status: "complete", stage: "awarded" };
    case "on_hold":
      return { status: "on_hold", stage: null };
    case "unqualified":
      return { status: "on_hold", stage: "unqualified" };
    case "lost":
      return { status: "on_hold", stage: "lost" };
    case "deleted":
      return { status: "on_hold", stage: null };
  }
}

export function isWorkColumn(value: string): value is WorkColumn {
  return WORK_COLUMNS.includes(value as WorkColumn);
}

function addressAfterDash(title: string) {
  const match = title.match(/\s[—–-]\s(.+)$/);
  return match?.[1]?.trim() ?? "";
}

function stripTrailing(value: string, suffix: string) {
  const hay = value.trim();
  const needle = suffix.trim();
  if (!needle || !hay.toLowerCase().endsWith(needle.toLowerCase())) return hay;
  return hay.slice(0, hay.length - needle.length).replace(/[\s,]+$/u, "").trim();
}

function localityLine(city: string, state: string, postalCode: string) {
  const cityState = [city, state].filter(Boolean).join(", ");
  return [cityState, postalCode].filter(Boolean).join(" ");
}

/** What to show on a board card after the title — skip lines already in the name. */
export function boardCardDetails(input: {
  title: string;
  customerName: string;
  location: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}) {
  const title = (input.title ?? "").trim();
  const customer = (input.customerName ?? "").trim();
  const location = (input.location ?? "").trim();
  const embedded = addressAfterDash(title);
  const parsed = parseLocation(location || embedded);
  const street = (input.street?.trim() || parsed.street).trim();
  const city = (input.city?.trim() || parsed.city).trim();
  const state = (input.state?.trim() || parsed.state).trim();
  const postalCode = (input.postalCode?.trim() || parsed.postalCode).trim();
  const locality = localityLine(city, state, postalCode);
  const headline = locality ? stripTrailing(title, locality) : title;
  const displayTitle = headline || street || location;
  const haystack = title.toLowerCase();
  const displayHay = displayTitle.toLowerCase();
  const last = customer.split(/\s+/).filter(Boolean).at(-1) ?? "";
  const showCustomer =
    Boolean(customer) &&
    !haystack.includes(customer.toLowerCase()) &&
    !(last.length > 1 && haystack.includes(last.toLowerCase()));
  const showLocation =
    Boolean(location) &&
    !haystack.includes(location.toLowerCase()) &&
    !(street.length > 3 && haystack.includes(street.toLowerCase()));
  const streetInTitle = street.length > 3 && displayHay.includes(street.toLowerCase());
  const localityInTitle = Boolean(locality) && displayHay.includes(locality.toLowerCase());
  return {
    title: displayTitle,
    showCustomer,
    customer,
    showLocation,
    location,
    /** Street on its own line when the title does not already contain it. */
    streetLine: streetInTitle ? "" : street,
    /** City, state, and zip, kept off the street line. */
    locality: localityInTitle ? "" : locality,
  };
}

/** Lost, unqualified, and deleted stay off the board until someone asks for closed work. */
const SHELVED_WORK_COLUMNS = new Set<WorkColumn>(["unqualified", "lost", "deleted"]);

export function isShelvedWorkColumn(column: WorkColumn) {
  return SHELVED_WORK_COLUMNS.has(column);
}

export type BoardCueTone = "fresh" | "attention" | "steady" | "aging" | "done" | "muted";

export type BoardCue = {
  label: string;
  tone: BoardCueTone;
};

const AGING_AFTER_DAYS = 14;

export function boardAgeLabel(days: number) {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days`;
}

/** One status line for a board card. Replaces the stack of estimate, age, and stage badges. */
export function boardCardCue(input: {
  column: WorkColumn;
  openedAt?: string | null;
  startedAt?: string | null;
  estimate?: "signed" | "viewed" | "sent" | null;
  now?: Date;
}): BoardCue {
  const now = input.now ?? new Date();
  if (input.column === "complete") return { label: "Done", tone: "done" };
  if (input.column === "deleted") return { label: "Deleted", tone: "muted" };
  if (input.column === "lost") return { label: "Lost", tone: "muted" };
  if (input.column === "unqualified") return { label: "Unqualified", tone: "muted" };
  if (input.column === "on_hold") return { label: "On hold", tone: "muted" };

  const opened = calendarDaysAgo(input.openedAt, now) ?? calendarDaysAgo(input.startedAt, now) ?? 0;
  const started = calendarDaysAgo(input.startedAt, now) ?? opened;

  if (input.column === "proposal_sent" || input.column === "supplementing") {
    if (input.estimate === "viewed") return { label: "Estimate viewed — follow up", tone: "attention" };
    if (input.estimate === "signed") return { label: "Estimate signed", tone: "done" };
    if (opened > AGING_AFTER_DAYS) return { label: `Aging · ${boardAgeLabel(opened)}`, tone: "aging" };
    if (input.estimate === "sent") return { label: `Sent · ${boardAgeLabel(opened)}`, tone: "steady" };
    if (input.column === "supplementing") {
      return { label: `Supplementing · ${boardAgeLabel(opened)}`, tone: "steady" };
    }
    return { label: `New · ${boardAgeLabel(opened)}`, tone: "fresh" };
  }

  if (input.column === "in_progress" || input.column === "punch") {
    if (started > AGING_AFTER_DAYS) return { label: `Aging · ${boardAgeLabel(started)}`, tone: "aging" };
    return { label: `On track · ${boardAgeLabel(started)}`, tone: "steady" };
  }

  if (opened > AGING_AFTER_DAYS) return { label: `Aging · ${boardAgeLabel(opened)}`, tone: "aging" };
  return { label: `New · ${boardAgeLabel(opened)}`, tone: "fresh" };
}

const COMPANY_NAME = /\b(llc|l\.l\.c|inc|corp|co|company|ltd|roofing|construction)\b/i;

/** Last name when the customer is a person. Companies and blank names fall back to the job title. */
export function boardCardName(customerName: string, title: string) {
  const customer = customerName.trim();
  const parts = customer.split(/\s+/).filter(Boolean);
  if (customer && parts.length > 1 && parts.length <= 4 && !COMPANY_NAME.test(customer)) {
    return parts[parts.length - 1] ?? customer;
  }
  if (customer) return customer;
  const head = title.split(/\s[—–-]\s/)[0]?.trim() ?? "";
  return head || title.trim() || "Untitled job";
}

/** One address line: street and city, without state or zip. */
export function boardCardAddress(input: {
  street?: string;
  city?: string;
  state?: string;
  location?: string;
}) {
  const street = input.street?.trim() ?? "";
  const city = input.city?.trim() ?? "";
  const state = input.state?.trim() ?? "";
  if (street && city) return `${street}, ${city}`;
  if (street) return street;
  if (city) return [city, state].filter(Boolean).join(", ");
  return (input.location ?? "").trim();
}
