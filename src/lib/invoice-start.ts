import type { EstimateStatus } from "@/lib/types";

const STATUS_RANK: Record<EstimateStatus, number> = {
  accepted: 0,
  sent: 1,
  viewed: 2,
  draft: 3,
  declined: 4,
};

export type InvoiceStartEstimate = {
  id: string;
  number: string;
  name: string;
  status: EstimateStatus;
  jobId: string | null;
  archivedAt?: string | null;
  createdAt?: string;
};

/** Estimates offered when a new invoice starts from an existing proposal. Archived estimates stay off the list. */
export function estimatesForInvoiceStart<T extends InvoiceStartEstimate>(
  estimates: T[],
  options: {
    jobId?: string | null;
    query?: string;
    haystack?: (estimate: T) => string;
  } = {},
): T[] {
  const jobId = options.jobId?.trim() ?? "";
  const needle = options.query?.trim().toLowerCase() ?? "";
  return estimates
    .filter((estimate) => !estimate.archivedAt)
    .filter((estimate) => !jobId || estimate.jobId === jobId)
    .filter((estimate) => {
      if (!needle) return true;
      const extra = options.haystack?.(estimate) ?? "";
      return `${estimate.number} ${estimate.name} ${extra}`.toLowerCase().includes(needle);
    })
    .sort((a, b) => {
      const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (byStatus !== 0) return byStatus;
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    });
}
