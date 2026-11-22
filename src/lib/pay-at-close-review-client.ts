import type { Job } from "@/lib/types";
import type { JobPayAtClose, PayAtCloseReport, PropertyRecord } from "@/lib/pay-at-close";

export type PayAtCloseReviewResult = {
  record: JobPayAtClose;
  live: boolean;
  provider: string;
  /** The saved property record was re-scored; no provider call was made. */
  reused: boolean;
  /** The host has a records provider key. */
  recordsConfigured: boolean;
  lookupError: string | null;
};

export type PayAtCloseReviewResponse = {
  ok?: boolean;
  error?: string;
  property?: unknown;
  report?: PayAtCloseReport;
  provider?: string;
  live?: boolean;
  reused?: boolean;
  recordsConfigured?: boolean;
  lookupError?: string | null;
};

export function jobHasReviewableAddress(job: Pick<Job, "street" | "city" | "state" | "postalCode">) {
  return Boolean(job.street && (job.postalCode || (job.city && job.state)));
}

/** Calls the review route and returns the record with the property record and report attached. Throws on failure. */
export async function requestPayAtCloseReview(input: {
  job: Job;
  record: JobPayAtClose;
  homeowner: string;
  reuseProperty: boolean;
}): Promise<PayAtCloseReviewResult> {
  const { job, record } = input;
  const response = await fetch("/api/pay-at-close/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: { street: job.street, city: job.city, state: job.state, postalCode: job.postalCode },
      record,
      reuseProperty: input.reuseProperty,
      jobName: job.name,
      homeowner: input.homeowner,
    }),
  });
  const body = (await response.json().catch(() => null)) as PayAtCloseReviewResponse | null;
  if (!response.ok || !body?.ok || !body.report) {
    throw new Error(body?.error ?? "The property review did not run.");
  }
  const property = (body.property ?? record.property) as PropertyRecord | null;
  return {
    record: { ...record, property, report: body.report },
    ...reviewOutcome(body),
  };
}

export function reviewOutcome(body: Pick<PayAtCloseReviewResponse, "live" | "provider" | "reused" | "recordsConfigured" | "lookupError">) {
  return {
    live: Boolean(body.live),
    provider: body.provider ?? "",
    reused: Boolean(body.reused),
    recordsConfigured: Boolean(body.recordsConfigured),
    lookupError: body.lookupError ?? null,
  };
}

/** One line on where the property data came from, for toasts and the assistant. */
export function recordsSourceLabel(result: ReturnType<typeof reviewOutcome>) {
  if (result.live) return result.provider;
  if (result.reused) return "Saved record";
  if (!result.recordsConfigured) return "Sample records (no ATTOM_API_KEY on the host)";
  return `${result.provider || "The records provider"} returned no live record`;
}

export function reviewRanToast(result: ReturnType<typeof reviewOutcome>) {
  if (result.live) return `Property review ran against ${result.provider}.`;
  if (result.reused) return "Re-scored from the saved property record.";
  if (!result.recordsConfigured) {
    return "Property review ran with sample records. Set ATTOM_API_KEY on the host for live public records.";
  }
  return `Property review ran, but ${result.provider || "the records provider"} did not return live records.`;
}
