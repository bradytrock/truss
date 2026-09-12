import { isDeletedJob } from "@/lib/job-record";
import {
  canViewTeamGoal,
  effectiveMonthlyQuota,
  goalRoster,
  jobOwner,
  teamQuota,
  wonContractAmount,
} from "@/lib/sales-goal";
import { jobWonAt } from "@/lib/won";
import {
  LEAD_SOURCE_LABELS,
  LEGACY_LEAD_SOURCE_LABELS,
  type CompanySettings,
  type Estimate,
  type EstimateLine,
  type Job,
  type Opportunity,
  type StaffMember,
} from "@/lib/types";

export type HomeWonDeal = {
  amount: number;
  wonAt: string;
  source: string;
  sourceLabel: string;
};

function sourceLabel(raw: string) {
  if (!raw) return "Unsourced";
  return (
    LEAD_SOURCE_LABELS[raw as keyof typeof LEAD_SOURCE_LABELS] ??
    LEGACY_LEAD_SOURCE_LABELS[raw] ??
    raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function wonDeals(input: {
  jobs: Job[];
  estimates: Estimate[];
  estimateLines: EstimateLine[];
  opportunities: Opportunity[];
  staff: StaffMember[];
  ownerIds?: Set<string> | null;
}): HomeWonDeal[] {
  const deals: HomeWonDeal[] = [];
  for (const job of input.jobs) {
    if (isDeletedJob(job)) continue;
    const wonAt = jobWonAt(job, input.estimates, input.opportunities);
    if (!wonAt) continue;
    if (input.ownerIds) {
      const owner = jobOwner(job, input.staff, input.opportunities);
      if (!owner || !input.ownerIds.has(owner.id)) continue;
    }
    const opportunity = input.opportunities.find((item) => item.id === job.opportunityId);
    const source = String(job.leadSource || opportunity?.leadSource || "");
    deals.push({
      amount: wonContractAmount(job, input.estimates, input.estimateLines, input.opportunities),
      wonAt,
      source,
      sourceLabel: sourceLabel(source),
    });
  }
  return deals;
}

export function homeGoalScope(viewer: StaffMember | undefined, staff: StaffMember[]) {
  if (!viewer) return { ownerIds: null as Set<string> | null, roster: [] as StaffMember[] };
  const roster = goalRoster(viewer, staff);
  if (canViewTeamGoal(viewer.role)) {
    return { ownerIds: new Set(roster.map((member) => member.id)), roster };
  }
  return { ownerIds: new Set([viewer.id]), roster: roster.filter((member) => member.id === viewer.id) };
}

export function homeQuota(
  viewer: StaffMember | undefined,
  company: Pick<CompanySettings, "defaultMonthlySalesQuota">,
  roster: StaffMember[],
) {
  if (!viewer) return 0;
  if (canViewTeamGoal(viewer.role)) return teamQuota(roster, company);
  return effectiveMonthlyQuota(viewer, company);
}

/** Last N calendar days of closed-won amount (inclusive of today). */
export function dealsByCloseDate(deals: HomeWonDeal[], days = 14, now = new Date()) {
  const buckets: { key: string; label: string; value: number }[] = [];
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - (days - 1));
  for (let i = 0; i < days; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    buckets.push({
      key,
      label: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: 0,
    });
  }
  const index = new Map(buckets.map((bucket, i) => [bucket.key, i]));
  for (const deal of deals) {
    const stamp = new Date(deal.wonAt);
    if (!Number.isFinite(stamp.getTime())) continue;
    const key = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, "0")}-${String(stamp.getDate()).padStart(2, "0")}`;
    const at = index.get(key);
    if (at == null) continue;
    buckets[at].value += deal.amount;
  }
  return buckets;
}

export function amountClosedBySource(deals: HomeWonDeal[], now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
  const totals = new Map<string, { label: string; value: number }>();
  for (const deal of deals) {
    const stamp = new Date(deal.wonAt).getTime();
    if (!Number.isFinite(stamp) || stamp < start || stamp > end) continue;
    const key = deal.source || "unsourced";
    const current = totals.get(key) ?? { label: deal.sourceLabel, value: 0 };
    current.value += deal.amount;
    totals.set(key, current);
  }
  return [...totals.values()].sort((a, b) => b.value - a.value);
}

export function formatCompactCurrency(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  }
  return `${sign}${Math.round(abs)}`;
}

export function closedWonThisMonth(deals: HomeWonDeal[], now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
  let amount = 0;
  let count = 0;
  for (const deal of deals) {
    const stamp = new Date(deal.wonAt).getTime();
    if (!Number.isFinite(stamp) || stamp < start || stamp > end) continue;
    amount += deal.amount;
    count += 1;
  }
  return { amount, count, avg: count > 0 ? amount / count : 0 };
}
