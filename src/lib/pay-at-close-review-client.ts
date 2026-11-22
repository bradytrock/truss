import type { Job } from "@/lib/types";
import type { JobPayAtClose, PayAtCloseReport, PropertyRecord } from "@/lib/pay-at-close";

export type PayAtCloseReviewResult = {
  record: JobPayAtClose;
  live: boolean;
  provider: string;
  lookupError: string | null;
};

type ReviewResponse = {
  ok?: boolean;
  error?: string;
  property?: unknown;
  report?: PayAtCloseReport;
  provider?: string;
  live?: boolean;
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
  const body = (await response.json().catch(() => null)) as ReviewResponse | null;
  if (!response.ok || !body?.ok || !body.report) {
    throw new Error(body?.error ?? "The property review did not run.");
  }
  const property = (body.property ?? record.property) as PropertyRecord | null;
  return {
    record: { ...record, property, report: body.report },
    live: Boolean(body.live),
    provider: body.provider ?? "",
    lookupError: body.lookupError ?? null,
  };
}

export function reviewRanToast(result: Pick<PayAtCloseReviewResult, "live" | "provider">) {
  return result.live
    ? `Property review ran against ${result.provider}.`
    : "Property review ran with sample records. Set ATTOM_API_KEY on the host for live public records.";
}
