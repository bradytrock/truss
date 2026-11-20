type JobLink = {
  id: string;
  opportunityId?: string | null;
  deletedAt?: string | null;
};

type EstimateLink = {
  jobId: string | null;
  opportunityId: string | null;
};

function deletedJob(job: { deletedAt?: string | null }) {
  return Boolean(job.deletedAt);
}

/** The job this proposal belongs on. A proposal built before the job existed still follows its lead. */
export function jobForEstimate<T extends JobLink>(
  estimate: { jobId?: string | null; opportunityId?: string | null },
  jobs: T[],
): T | undefined {
  if (estimate.jobId) {
    return (
      jobs.find((job) => job.id === estimate.jobId && !deletedJob(job)) ??
      jobs.find((job) => job.id === estimate.jobId)
    );
  }
  if (!estimate.opportunityId) return undefined;
  const matches = jobs.filter(
    (job) => job.opportunityId === estimate.opportunityId && !deletedJob(job),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * Proposals on a job record. Includes ones that share the lead but were saved
 * before the job row existed, and leaves a proposal that already points at a
 * different job on that job.
 */
export function estimatesOnJob<T extends EstimateLink>(job: JobLink, estimates: T[]): T[] {
  return estimates.filter((estimate) => {
    if (estimate.jobId === job.id) return true;
    if (estimate.jobId || deletedJob(job) || !job.opportunityId) return false;
    return estimate.opportunityId === job.opportunityId;
  });
}

/** Point proposals that only know the lead at the job that was just opened for it. */
export function claimEstimatesForJob<T extends EstimateLink>(estimates: T[], job: JobLink): T[] {
  if (!job.opportunityId) return estimates;
  let changed = false;
  const next = estimates.map((estimate) => {
    if (estimate.jobId || estimate.opportunityId !== job.opportunityId) return estimate;
    changed = true;
    return { ...estimate, jobId: job.id };
  });
  return changed ? next : estimates;
}
