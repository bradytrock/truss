import { roundMoney, acceptedAmountForJob, amountForEstimate } from "@/lib/estimate-totals";
import { dedupeJobsByOpportunity, isDeletedJob } from "@/lib/job-record";
import { parseMarket, workMarket } from "@/lib/market";
import type { Estimate, EstimateLine, Job, Opportunity } from "@/lib/types";
import { boardValue, workColumnFor, WORK_COLUMN_LABELS, type WorkColumn } from "@/lib/work-board";
import { estimatesForJob } from "@/lib/won";

/**
 * Working columns on the jobs board, in board order.
 * Complete, lost, unqualified, and deleted are outcomes, not the path.
 */
export const PIPELINE_PATH_COLUMNS = [
  "lead",
  "proposal_sent",
  "in_progress",
  "supplementing",
  "punch",
  "on_hold",
] as const satisfies readonly WorkColumn[];

export type PipelinePathColumn = (typeof PIPELINE_PATH_COLUMNS)[number];

const PATH_COLUMN_SET = new Set<WorkColumn>(PIPELINE_PATH_COLUMNS);

export type PipelinePathRow = {
  column: PipelinePathColumn;
  label: string;
  value: number;
};

/**
 * Full contract amount for one record.
 * A saved contract or a signed proposal wins. Otherwise the newest sent,
 * viewed, or drafted proposal with a total is the contract. Win probability
 * does not scale the amount — that forecast is a separate number.
 */
export function unweightedContractValue(input: {
  job: Pick<Job, "id" | "opportunityId" | "contractValue" | "market" | "projectType">;
  opportunity?: Pick<Opportunity, "value" | "market" | "projectType"> | null;
  estimates: Estimate[];
  lines: EstimateLine[];
}) {
  const market = workMarket(input.job, input.opportunity);
  const related = estimatesForJob(input.job, input.estimates);
  const signed = acceptedAmountForJob(input.job, related, input.lines, market);
  const booked = boardValue(input.job, input.opportunity, signed);
  if (booked > 0) return booked;
  return newestOpenProposalAmount(related, input.lines, market);
}

function newestOpenProposalAmount(
  estimates: Estimate[],
  lines: EstimateLine[],
  market: ReturnType<typeof workMarket>,
) {
  const tiers: Estimate["status"][][] = [["accepted"], ["sent", "viewed"], ["draft"]];
  const open = estimates.filter((estimate) => !estimate.archivedAt && estimate.status !== "declined");
  for (const statuses of tiers) {
    const tier = open
      .filter((estimate) => statuses.includes(estimate.status))
      .sort((left, right) => proposalStamp(right).localeCompare(proposalStamp(left)));
    for (const estimate of tier) {
      const amount = amountForEstimate(estimate, lines, market);
      if (amount > 0) return amount;
    }
  }
  return 0;
}

function proposalStamp(estimate: Pick<Estimate, "acceptedAt" | "sentAt" | "createdAt">) {
  return estimate.acceptedAt || estimate.sentAt || estimate.createdAt || "";
}

/**
 * Unweighted contract value in each jobs-board column.
 * A card's column is the board column, so a job already in progress is not
 * still counted under the lead's old stage.
 */
export function pipelinePathTotals(input: {
  jobs: Job[];
  opportunities: Opportunity[];
  estimates: Estimate[];
  lines: EstimateLine[];
}): PipelinePathRow[] {
  const deduped = dedupeJobsByOpportunity(input.jobs);
  const jobs = deduped.filter((job) => !isDeletedJob(job));
  const opportunities = new Map(input.opportunities.map((opportunity) => [opportunity.id, opportunity]));
  // A deleted card stays off the path. Do not put that lead back from the opportunity row.
  const covered = new Set(
    deduped.map((job) => job.opportunityId).filter((id): id is string => Boolean(id)),
  );
  const totals = new Map<PipelinePathColumn, number>(PIPELINE_PATH_COLUMNS.map((column) => [column, 0]));

  const add = (
    column: WorkColumn,
    job: Pick<Job, "id" | "opportunityId" | "contractValue" | "market" | "projectType">,
    opportunity?: Opportunity | null,
  ) => {
    if (!PATH_COLUMN_SET.has(column)) return;
    const key = column as PipelinePathColumn;
    totals.set(
      key,
      (totals.get(key) ?? 0) +
        unweightedContractValue({
          job,
          opportunity,
          estimates: input.estimates,
          lines: input.lines,
        }),
    );
  };

  for (const job of jobs) {
    const opportunity = job.opportunityId ? opportunities.get(job.opportunityId) : undefined;
    add(workColumnFor(job, opportunity), job, opportunity);
  }

  for (const opportunity of input.opportunities) {
    if (covered.has(opportunity.id)) continue;
    add(
      workColumnFor(
        { status: "precon", opportunityId: opportunity.id, deletedAt: null },
        opportunity,
      ),
      {
        id: `pipeline_${opportunity.id}`,
        opportunityId: opportunity.id,
        contractValue: 0,
        market: parseMarket(opportunity.market, opportunity.projectType),
        projectType: opportunity.projectType,
      },
      opportunity,
    );
  }

  return PIPELINE_PATH_COLUMNS.map((column) => ({
    column,
    label: WORK_COLUMN_LABELS[column],
    value: roundMoney(totals.get(column) ?? 0),
  }));
}
