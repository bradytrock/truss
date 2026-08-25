import { localYmd } from "@/lib/format";
import { acceptedAmountForJob } from "@/lib/estimate-totals";
import { isDeletedJob } from "@/lib/job-record";
import type {
  CrmState,
  Estimate,
  EstimateLine,
  Job,
  LeadSource,
  Opportunity,
  PipelineStage,
  ProjectType,
  StaffMember,
} from "@/lib/types";
import { isJobWon, isOpportunityWon, jobWonAt } from "@/lib/won";
import {
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  LEAD_SOURCE_LABELS,
  PIPELINE_STAGES,
  PROJECT_TYPE_LABELS,
  STAGE_LABELS,
} from "@/lib/types";
import { accessScope, staffForReports, type AccessScope } from "@/lib/visibility";

export function yearOf(value: string | null | undefined) {
  if (!value) return null;
  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

export type DatePreset = "mtd" | "30" | "90" | "ytd" | "all";
export type ReportTab =
  | "jobs"
  | "leads"
  | "team"
  | "lost"
  | "overview"
  | "workflow"
  | "pipeline";

export const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: "mtd", label: "Month to date" },
  { id: "30", label: "Last 30 days" },
  { id: "90", label: "Last 90 days" },
  { id: "ytd", label: "Year to date" },
  { id: "all", label: "All time" },
];

export const REPORT_TABS: { id: ReportTab; label: string; teamOnly?: boolean }[] = [
  { id: "jobs", label: "Job report" },
  { id: "leads", label: "Lead performance" },
  { id: "team", label: "Team performance", teamOnly: true },
  { id: "lost", label: "Lost jobs" },
  { id: "overview", label: "Overview" },
  { id: "workflow", label: "Workflow" },
  { id: "pipeline", label: "Pipeline" },
];

const QUALIFIED_STAGES: ReadonlySet<PipelineStage> = new Set([
  "estimating",
  "bid_submitted",
  "interview",
  "awarded",
]);

export type ReportBook = Pick<
  CrmState,
  "staff" | "jobs" | "opportunities" | "contacts" | "estimates" | "estimateLines"
>;

export type SourceRow = {
  source: string;
  incoming: number;
  qualified: number;
  won: number;
  wonValue: number;
  avgWon: number;
  newToQualified: number;
  qualifiedClose: number;
};

export type TeamRow = {
  staff: StaffMember;
  won: number;
  wonValue: number;
  lost: number;
  assigned: number;
  qualified: number;
  closeRate: number;
  qualifiedClose: number;
  avgJob: number;
};

export type LostReasonRow = {
  reason: string;
  count: number;
  value: number;
  pctCount: number;
  pctValue: number;
  avgValue: number;
  avgDays: number;
};

export type WorkflowRow = {
  label: string;
  winRate: number;
  won: number;
  lost: number;
  pending: number;
  total: number;
  wonValue: number;
  lostValue: number;
  pendingValue: number;
  totalValue: number;
  share: number;
};

export type PipelineRow = {
  id: string;
  label: string;
  count: number;
  value: number;
};

export type LostJobRow = {
  id: string;
  name: string;
  location: string;
  source: string;
  owner: string;
  value: number;
  reason: string;
  createdAt: string;
  days: number | null;
};

export type PerformanceReport = {
  year: number;
  scope: AccessScope;
  range: { start: string | null; end: string };
  kpis: {
    totalJobs: number;
    totalValue: number;
    avgJob: number;
    lostCount: number;
    lostAvg: number;
    lostTotal: number;
    highestLost: number;
    topLostReason: string;
    daysToLoss: number;
    incoming: number;
    daysToSold: number;
    newToQualified: number;
    qualifiedClose: number;
    closeRate: number;
    wonCount: number;
    wonValue: number;
    daysToComplete: number;
  };
  monthlyWon: { key: string; label: string; count: number; value: number }[];
  bySource: SourceRow[];
  byTeam: TeamRow[];
  lostReasons: LostReasonRow[];
  lostJobs: LostJobRow[];
  byProjectType: WorkflowRow[];
  pipeline: PipelineRow[];
  highlights: {
    topCloser: TeamRow | null;
    biggestJob: { name: string; value: number; owner: string } | null;
    mostAssigned: TeamRow | null;
    mostQualified: TeamRow | null;
  };
};

export function rangeForPreset(preset: DatePreset, now = new Date()) {
  const end = localYmd(now);
  if (preset === "all") return { start: null as string | null, end };
  if (preset === "mtd") {
    return { start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, end };
  }
  if (preset === "ytd") return { start: `${now.getFullYear()}-01-01`, end };
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (preset === "30" ? 30 : 90));
  return { start: localYmd(start), end };
}

function ymd(iso: string | null | undefined) {
  return iso ? iso.slice(0, 10) : "";
}

function inRange(iso: string | null | undefined, start: string | null, end: string) {
  const value = ymd(iso);
  if (!value) return false;
  if (start && value < start) return false;
  return value <= end;
}

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

function monthLabel(key: string) {
  const [year, month] = key.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

function daysBetween(from: string | null | undefined, to: string | null | undefined) {
  const a = ymd(from);
  const b = ymd(to);
  if (!a || !b) return null;
  const ms = Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round(ms / 86_400_000));
}

function avg(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sourceKey(record: { leadSource?: LeadSource | "" }) {
  return record.leadSource || "unsourced";
}

function sourceLabel(key: string) {
  if (key === "unsourced") return "Unsourced";
  return LEAD_SOURCE_LABELS[key as LeadSource] ?? key;
}

function jobOwner(job: Job, staff: StaffMember[]) {
  return (
    staff.find((member) => member.id === job.ownerStaffId) ??
    staff.find((member) => member.name === job.projectManager || member.name === job.salesRep)
  );
}

function opportunityOwner(opportunity: Opportunity, staff: StaffMember[]) {
  return (
    staff.find((member) => member.id === opportunity.ownerStaffId) ??
    staff.find((member) => member.name === opportunity.estimator)
  );
}

function wonAmount(
  job: Job,
  estimates: Estimate[],
  lines: EstimateLine[],
  opportunities: Opportunity[],
) {
  const signed = acceptedAmountForJob(job, estimates, lines, job.market);
  if (signed > 0) return signed;
  if (job.contractValue > 0) return job.contractValue;
  return opportunities.find((item) => item.id === job.opportunityId)?.value ?? 0;
}

function wonAmountForOpportunity(
  opportunity: Opportunity,
  jobs: Job[],
  estimates: Estimate[],
  lines: EstimateLine[],
) {
  const job = jobs.find((item) => item.opportunityId === opportunity.id);
  if (job) return wonAmount(job, estimates, lines, [opportunity]);
  const signed = acceptedAmountForJob(
    { id: "", opportunityId: opportunity.id },
    estimates,
    lines,
    opportunity.market,
  );
  if (signed > 0) return signed;
  return opportunity.value;
}

export function buildPerformance(
  book: ReportBook,
  viewer: StaffMember,
  preset: DatePreset,
  now = new Date()
): PerformanceReport {
  const range = rangeForPreset(preset, now);
  const scope = accessScope(viewer.role);
  // Jobs and leads are already limited by scopeBook in the CRM store.
  // Re-filter only by date here so superintendent-assigned work still counts.
  const roster = staffForReports(viewer, book.staff);

  const liveJobs = book.jobs.filter((job) => !isDeletedJob(job));
  const estimates = book.estimates ?? [];
  const estimateLines = book.estimateLines ?? [];
  const jobs = liveJobs.filter((job) => inRange(job.startDate, range.start, range.end));
  const opportunities = book.opportunities.filter((item) =>
    inRange(item.createdAt, range.start, range.end)
  );
  const soldJobs = liveJobs.filter((job) =>
    inRange(jobWonAt(job, estimates, book.opportunities), range.start, range.end),
  );
  const soldIds = new Set(soldJobs.map((job) => job.id));
  const lost = opportunities.filter((item) => item.stage === "lost");
  const qualified = opportunities.filter((item) => QUALIFIED_STAGES.has(item.stage));
  const wonOpps = opportunities.filter((item) => isOpportunityWon(item, estimates, liveJobs));

  const lostValues = lost.map((item) => item.value);
  const lossDays = lost
    .map((item) => daysBetween(item.createdAt, range.end))
    .filter((value): value is number => value !== null);
  const soldDays = soldJobs
    .map((job) => {
      const linked = job.opportunityId
        ? book.opportunities.find((item) => item.id === job.opportunityId)
        : undefined;
      const wonAt = jobWonAt(job, estimates, book.opportunities);
      return daysBetween(linked?.createdAt ?? wonAt, wonAt);
    })
    .filter((value): value is number => value !== null);
  const completeDays = soldJobs
    .filter((job) => job.status === "complete")
    .map((job) => daysBetween(job.startDate, job.substantialCompletion))
    .filter((value): value is number => value !== null);

  const reasonMap = new Map<string, { count: number; value: number; days: number[] }>();
  for (const item of lost) {
    const reason = item.lostReason?.trim() || "No reason recorded";
    const bucket = reasonMap.get(reason) ?? { count: 0, value: 0, days: [] };
    bucket.count += 1;
    bucket.value += item.value;
    const days = daysBetween(item.createdAt, range.end);
    if (days !== null) bucket.days.push(days);
    reasonMap.set(reason, bucket);
  }
  const lostTotal = lostValues.reduce((sum, value) => sum + value, 0);
  const lostReasons: LostReasonRow[] = [...reasonMap.entries()]
    .map(([reason, bucket]) => ({
      reason,
      count: bucket.count,
      value: bucket.value,
      pctCount: lost.length ? bucket.count / lost.length : 0,
      pctValue: lostTotal ? bucket.value / lostTotal : 0,
      avgValue: bucket.count ? bucket.value / bucket.count : 0,
      avgDays: avg(bucket.days),
    }))
    .sort((a, b) => b.value - a.value);

  const monthMap = new Map<string, { count: number; value: number }>();
  for (const job of soldJobs) {
    const wonAt = jobWonAt(job, estimates, book.opportunities);
    if (!wonAt) continue;
    const key = monthKey(wonAt);
    const bucket = monthMap.get(key) ?? { count: 0, value: 0 };
    bucket.count += 1;
    bucket.value += wonAmount(job, estimates, estimateLines, book.opportunities);
    monthMap.set(key, bucket);
  }
  const monthlyWon = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bucket]) => ({ key, label: monthLabel(key), ...bucket }));

  const sourceMap = new Map<string, SourceRow>();
  for (const opportunity of opportunities) {
    const key = sourceKey(opportunity);
    const row = sourceMap.get(key) ?? {
      source: sourceLabel(key),
      incoming: 0,
      qualified: 0,
      won: 0,
      wonValue: 0,
      avgWon: 0,
      newToQualified: 0,
      qualifiedClose: 0,
    };
    row.incoming += 1;
    if (QUALIFIED_STAGES.has(opportunity.stage)) row.qualified += 1;
    if (isOpportunityWon(opportunity, estimates, liveJobs)) {
      row.won += 1;
      row.wonValue += wonAmountForOpportunity(opportunity, liveJobs, estimates, estimateLines);
    }
    sourceMap.set(key, row);
  }
  const bySource = [...sourceMap.values()]
    .map((row) => ({
      ...row,
      avgWon: row.won ? row.wonValue / row.won : 0,
      newToQualified: row.incoming ? row.qualified / row.incoming : 0,
      qualifiedClose: row.qualified ? row.won / row.qualified : 0,
    }))
    .sort((a, b) => b.incoming - a.incoming);

  const teamMap = new Map<string, TeamRow>();
  for (const member of roster) {
    teamMap.set(member.id, {
      staff: member,
      won: 0,
      wonValue: 0,
      lost: 0,
      assigned: 0,
      qualified: 0,
      closeRate: 0,
      qualifiedClose: 0,
      avgJob: 0,
    });
  }
  for (const opportunity of opportunities) {
    const owner = opportunityOwner(opportunity, book.staff);
    if (!owner || !teamMap.has(owner.id)) continue;
    const row = teamMap.get(owner.id)!;
    row.assigned += 1;
    if (QUALIFIED_STAGES.has(opportunity.stage)) row.qualified += 1;
    if (opportunity.stage === "lost") row.lost += 1;
    if (isOpportunityWon(opportunity, estimates, liveJobs)) {
      row.won += 1;
      row.wonValue += wonAmountForOpportunity(opportunity, liveJobs, estimates, estimateLines);
    }
  }
  const byTeam = [...teamMap.values()]
    .map((row) => {
      const decided = row.won + row.lost;
      return {
        ...row,
        closeRate: decided ? row.won / decided : 0,
        qualifiedClose: row.qualified ? row.won / row.qualified : 0,
        avgJob: row.won ? row.wonValue / row.won : 0,
      };
    })
    .filter((row) => row.assigned > 0 || row.won > 0)
    .sort((a, b) => b.wonValue - a.wonValue);

  const typeBuckets = new Map<
    string,
    { won: number; lost: number; pending: number; wonValue: number; lostValue: number; pendingValue: number }
  >();
  function typeBucket(label: string) {
    const current = typeBuckets.get(label) ?? {
      won: 0,
      lost: 0,
      pending: 0,
      wonValue: 0,
      lostValue: 0,
      pendingValue: 0,
    };
    typeBuckets.set(label, current);
    return current;
  }
  for (const job of soldJobs) {
    const label = job.projectType ? PROJECT_TYPE_LABELS[job.projectType as ProjectType] : "Unspecified";
    const bucket = typeBucket(label);
    bucket.won += 1;
    bucket.wonValue += wonAmount(job, estimates, estimateLines, book.opportunities);
  }
  for (const job of jobs) {
    if (soldIds.has(job.id) || isJobWon(job, estimates, book.opportunities)) continue;
    const label = job.projectType ? PROJECT_TYPE_LABELS[job.projectType as ProjectType] : "Unspecified";
    const bucket = typeBucket(label);
    bucket.pending += 1;
    bucket.pendingValue += job.contractValue;
  }
  for (const item of lost) {
    const bucket = typeBucket(PROJECT_TYPE_LABELS[item.projectType]);
    bucket.lost += 1;
    bucket.lostValue += item.value;
  }
  const typeRows = [...typeBuckets.entries()].map(([label, bucket]) => {
    const total = bucket.won + bucket.lost + bucket.pending;
    const totalValue = bucket.wonValue + bucket.lostValue + bucket.pendingValue;
    return {
      label,
      winRate: bucket.won + bucket.lost ? bucket.won / (bucket.won + bucket.lost) : 0,
      won: bucket.won,
      lost: bucket.lost,
      pending: bucket.pending,
      total,
      wonValue: bucket.wonValue,
      lostValue: bucket.lostValue,
      pendingValue: bucket.pendingValue,
      totalValue,
      share: 0,
    };
  });
  const grand = typeRows.reduce((sum, row) => sum + row.totalValue, 0) || 1;
  const byProjectType = typeRows
    .map((row) => ({ ...row, share: row.totalValue / grand }))
    .sort((a, b) => b.totalValue - a.totalValue);

  const pipelineOpps = book.opportunities;
  const pipelineJobs = liveJobs;
  const pipeline: PipelineRow[] = [
    ...PIPELINE_STAGES.filter((stage) => stage !== "lost").map((stage) => {
      const rows = pipelineOpps.filter((item) => item.stage === stage);
      return {
        id: stage,
        label: STAGE_LABELS[stage],
        count: rows.length,
        value: rows.reduce((sum, item) => sum + item.value, 0),
      };
    }),
    ...JOB_STATUSES.map((status) => {
      const rows = pipelineJobs.filter((job) => job.status === status);
      return {
        id: status,
        label: JOB_STATUS_LABELS[status],
        count: rows.length,
        value: rows.reduce((sum, job) => sum + job.contractValue, 0),
      };
    }),
  ];

  const lostJobs: LostJobRow[] = lost.map((item) => {
    const owner = opportunityOwner(item, book.staff);
    return {
      id: item.id,
      name: item.name,
      location: item.location,
      source: sourceLabel(sourceKey(item)),
      owner: owner?.name ?? item.estimator,
      value: item.value,
      reason: item.lostReason?.trim() || "No reason recorded",
      createdAt: item.createdAt,
      days: daysBetween(item.createdAt, range.end),
    };
  });

  const topCloser =
    [...byTeam].sort((a, b) => b.closeRate - a.closeRate || b.wonValue - a.wonValue)[0] ?? null;
  const mostAssigned = [...byTeam].sort((a, b) => b.assigned - a.assigned)[0] ?? null;
  const mostQualified = [...byTeam].sort((a, b) => b.qualified - a.qualified)[0] ?? null;
  const biggest = [...soldJobs].sort(
    (a, b) =>
      wonAmount(b, estimates, estimateLines, book.opportunities) -
      wonAmount(a, estimates, estimateLines, book.opportunities),
  )[0];
  const decided = wonOpps.length + lost.length;
  const soldValue = soldJobs.reduce(
    (sum, job) => sum + wonAmount(job, estimates, estimateLines, book.opportunities),
    0,
  );

  return {
    year: now.getFullYear(),
    scope,
    range,
    kpis: {
      totalJobs: soldJobs.length,
      totalValue: soldValue,
      avgJob: soldJobs.length ? soldValue / soldJobs.length : 0,
      lostCount: lost.length,
      lostAvg: avg(lostValues),
      lostTotal,
      highestLost: lostValues.length ? Math.max(...lostValues) : 0,
      topLostReason: lostReasons[0]?.reason ?? "—",
      daysToLoss: avg(lossDays),
      incoming: opportunities.length,
      daysToSold: avg(soldDays),
      newToQualified: opportunities.length ? qualified.length / opportunities.length : 0,
      qualifiedClose: qualified.length ? wonOpps.length / qualified.length : 0,
      closeRate: decided ? wonOpps.length / decided : 0,
      wonCount: soldJobs.length,
      wonValue: soldValue,
      daysToComplete: avg(completeDays),
    },
    monthlyWon,
    bySource,
    byTeam,
    lostReasons,
    lostJobs,
    byProjectType,
    pipeline,
    highlights: {
      topCloser,
      biggestJob: biggest
        ? {
            name: biggest.name,
            value: wonAmount(biggest, estimates, estimateLines, book.opportunities),
            owner: jobOwner(biggest, book.staff)?.name ?? biggest.projectManager,
          }
        : null,
      mostAssigned,
      mostQualified,
    },
  };
}

export function formatShare(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function rangeLabel(range: { start: string | null; end: string }) {
  const end = new Date(`${range.end}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (!range.start) return `Through ${end}`;
  const start = new Date(`${range.start}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${start} – ${end}`;
}
