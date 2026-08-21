import type { Job, JobStatus, Opportunity, PipelineStage } from "@/lib/types";

export const WORK_COLUMNS = [
  "lead",
  "estimating",
  "proposal_sent",
  "in_progress",
  "punch",
  "complete",
  "on_hold",
  "lost",
  "deleted",
] as const;

export type WorkColumn = (typeof WORK_COLUMNS)[number];

export const WORK_COLUMN_LABELS: Record<WorkColumn, string> = {
  lead: "Lead",
  estimating: "Estimating",
  proposal_sent: "Proposal sent",
  in_progress: "In progress",
  punch: "Punch list",
  complete: "Complete",
  on_hold: "On hold",
  lost: "Lost",
  deleted: "Deleted",
};

export function workColumnFor(
  job: Pick<Job, "status" | "opportunityId" | "deletedAt">,
  opportunity?: Pick<Opportunity, "stage"> | null,
): WorkColumn {
  if (job.deletedAt) return "deleted";
  if (opportunity?.stage === "lost") return "lost";
  if (job.status === "complete") return "complete";
  if (job.status === "punch") return "punch";
  if (job.status === "in_progress") return "in_progress";
  if (job.status === "on_hold") return "on_hold";
  if (opportunity?.stage === "awarded") return "in_progress";
  if (opportunity?.stage === "bid_submitted" || opportunity?.stage === "interview") return "proposal_sent";
  if (opportunity?.stage === "estimating") return "estimating";
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
    case "estimating":
      return { status: "precon", stage: "estimating" };
    case "proposal_sent":
      return { status: "precon", stage: "bid_submitted" };
    case "in_progress":
      return { status: "in_progress", stage: "awarded" };
    case "punch":
      return { status: "punch", stage: "awarded" };
    case "complete":
      return { status: "complete", stage: "awarded" };
    case "on_hold":
      return { status: "on_hold", stage: null };
    case "lost":
      return { status: "on_hold", stage: "lost" };
    case "deleted":
      return { status: "on_hold", stage: null };
  }
}

export function isWorkColumn(value: string): value is WorkColumn {
  return WORK_COLUMNS.includes(value as WorkColumn);
}
