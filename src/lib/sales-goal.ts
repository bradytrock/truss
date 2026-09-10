import { acceptedAmountForJob } from "@/lib/estimate-totals";
import { isDeletedJob } from "@/lib/job-record";
import type {
  CompanySettings,
  Estimate,
  EstimateLine,
  Job,
  Opportunity,
  SeatRole,
  StaffMember,
} from "@/lib/types";
import { jobWonAt } from "@/lib/won";

const NON_QUOTA_ROLES: ReadonlySet<SeatRole> = new Set(["accountant"]);

export function monthBounds(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

/** Weekdays left this month, including today when today is a weekday. */
export function sellingDaysLeft(now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let count = 0;
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export function effectiveMonthlyQuota(
  member: Pick<StaffMember, "monthlySalesQuota"> | null | undefined,
  company: Pick<CompanySettings, "defaultMonthlySalesQuota"> | null | undefined,
) {
  if (member?.monthlySalesQuota != null && Number.isFinite(member.monthlySalesQuota)) {
    return Math.max(0, member.monthlySalesQuota);
  }
  const fallback = company?.defaultMonthlySalesQuota ?? 0;
  return Number.isFinite(fallback) ? Math.max(0, fallback) : 0;
}

export function staffCountsTowardQuota(member: StaffMember) {
  return !member.locked && !NON_QUOTA_ROLES.has(member.role);
}

export function teamQuota(
  members: StaffMember[],
  company: Pick<CompanySettings, "defaultMonthlySalesQuota">,
) {
  return members
    .filter(staffCountsTowardQuota)
    .reduce((sum, member) => sum + effectiveMonthlyQuota(member, company), 0);
}

export function jobOwner(
  job: Job,
  staff: StaffMember[],
  opportunities: Opportunity[],
) {
  const byId = staff.find((member) => member.id === job.ownerStaffId);
  if (byId) return byId;
  const byName = staff.find(
    (member) => member.name === job.salesRep || member.name === job.projectManager,
  );
  if (byName) return byName;
  if (job.opportunityId) {
    const opportunity = opportunities.find((item) => item.id === job.opportunityId);
    if (opportunity?.ownerStaffId) {
      return staff.find((member) => member.id === opportunity.ownerStaffId);
    }
  }
  return undefined;
}

export function wonContractAmount(
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

export function soldThisMonth(input: {
  jobs: Job[];
  estimates: Estimate[];
  estimateLines: EstimateLine[];
  opportunities: Opportunity[];
  staff: StaffMember[];
  /** When set, only contracts attributed to these seats count. */
  ownerIds?: Set<string> | null;
  now?: Date;
}) {
  const { start, end } = monthBounds(input.now);
  const startMs = start.getTime();
  const endMs = end.getTime();
  let total = 0;
  for (const job of input.jobs) {
    if (isDeletedJob(job)) continue;
    const wonAt = jobWonAt(job, input.estimates, input.opportunities);
    if (!wonAt) continue;
    const stamp = new Date(wonAt).getTime();
    if (!Number.isFinite(stamp) || stamp < startMs || stamp > endMs) continue;
    if (input.ownerIds) {
      const owner = jobOwner(job, input.staff, input.opportunities);
      if (!owner || !input.ownerIds.has(owner.id)) continue;
    }
    total += wonContractAmount(
      job,
      input.estimates,
      input.estimateLines,
      input.opportunities,
    );
  }
  return total;
}

export function goalPace(sold: number, quota: number, daysLeft: number) {
  const remaining = Math.max(0, quota - sold);
  const hit = quota > 0 && sold >= quota;
  const perDay = !hit && daysLeft > 0 ? remaining / daysLeft : 0;
  return { remaining, hit, perDay, daysLeft };
}

export function canViewTeamGoal(role: SeatRole | undefined) {
  return role === "company_admin" || role === "team_lead" || role === "team_admin";
}

export function goalRoster(viewer: StaffMember, staff: StaffMember[]): StaffMember[] {
  const pool = staff.filter(staffCountsTowardQuota);
  if (viewer.role === "company_admin") return pool;
  if ((viewer.role === "team_lead" || viewer.role === "team_admin") && viewer.teamId) {
    return pool.filter(
      (member) => member.teamId === viewer.teamId || member.id === viewer.id,
    );
  }
  return pool.filter((member) => member.id === viewer.id);
}
