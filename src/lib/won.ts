import { estimateFullySigned } from "@/lib/estimate-signers";
import type { Estimate, Job, JobStatus, Opportunity } from "@/lib/types";

const PRODUCTION_STATUSES: ReadonlySet<JobStatus> = new Set(["in_progress", "punch", "complete"]);

export function estimatesForJob(
  job: Pick<Job, "id" | "opportunityId">,
  estimates: Estimate[],
) {
  return estimates.filter(
    (estimate) =>
      estimate.jobId === job.id ||
      Boolean(job.opportunityId && estimate.opportunityId === job.opportunityId),
  );
}

export function estimatesForOpportunity(
  opportunity: Pick<Opportunity, "id">,
  estimates: Estimate[],
  jobs: Array<Pick<Job, "id" | "opportunityId">>,
) {
  const jobIds = new Set(
    jobs.filter((job) => job.opportunityId === opportunity.id).map((job) => job.id),
  );
  return estimates.filter(
    (estimate) =>
      estimate.opportunityId === opportunity.id || Boolean(estimate.jobId && jobIds.has(estimate.jobId)),
  );
}

/** Moment the homeowner contract became signed. Null until the proposal is accepted. */
export function contractSignedAt(
  estimate: Pick<Estimate, "status" | "acceptedAt" | "secondAcceptedAt" | "secondContactId">,
) {
  const signed = estimate.status === "accepted" || estimateFullySigned(estimate);
  if (!signed) return null;
  const stamps = [estimate.acceptedAt, estimate.secondAcceptedAt].filter(
    (value): value is string => Boolean(value),
  );
  if (!stamps.length) return null;
  return stamps.sort()[stamps.length - 1];
}

function earliestSignedAt(estimates: Estimate[]) {
  const dates = estimates.map(contractSignedAt).filter((value): value is string => Boolean(value));
  if (!dates.length) return null;
  return dates.sort()[0];
}

/**
 * When this job was won. A signed estimate is the contract date.
 * Awarded / in-production jobs with no digital signature still count (legacy board moves).
 */
export function jobWonAt(
  job: Pick<Job, "id" | "opportunityId" | "status" | "startDate">,
  estimates: Estimate[],
  opportunities: Array<Pick<Opportunity, "id" | "stage" | "createdAt">>,
) {
  const signed = earliestSignedAt(estimatesForJob(job, estimates));
  if (signed) return signed;
  const opportunity = opportunities.find((item) => item.id === job.opportunityId);
  if (opportunity?.stage === "awarded") return job.startDate || opportunity.createdAt || null;
  if (PRODUCTION_STATUSES.has(job.status)) return job.startDate || null;
  return null;
}

export function isJobWon(
  job: Pick<Job, "id" | "opportunityId" | "status" | "startDate">,
  estimates: Estimate[],
  opportunities: Array<Pick<Opportunity, "id" | "stage" | "createdAt">>,
) {
  return Boolean(jobWonAt(job, estimates, opportunities));
}

export function opportunityWonAt(
  opportunity: Pick<Opportunity, "id" | "stage" | "createdAt">,
  estimates: Estimate[],
  jobs: Array<Pick<Job, "id" | "opportunityId" | "startDate">>,
) {
  const signed = earliestSignedAt(estimatesForOpportunity(opportunity, estimates, jobs));
  if (signed) return signed;
  if (opportunity.stage === "awarded") {
    const job = jobs.find((item) => item.opportunityId === opportunity.id);
    return job?.startDate || opportunity.createdAt || null;
  }
  return null;
}

export function isOpportunityWon(
  opportunity: Pick<Opportunity, "id" | "stage" | "createdAt">,
  estimates: Estimate[],
  jobs: Array<Pick<Job, "id" | "opportunityId" | "startDate">>,
) {
  return Boolean(opportunityWonAt(opportunity, estimates, jobs));
}
