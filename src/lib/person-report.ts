import { isDeletedJob, parseLocation } from "@/lib/job-record";
import { LEAD_SOURCE_LABELS, PROJECT_TYPE_LABELS, closingRate, type Job, type LeadSource, type Opportunity, type PipelineStage, type ProjectType, type StaffMember } from "@/lib/types";
import { estimatesForOpportunity, isOpportunityWon, opportunityWonAt } from "@/lib/won";
import {
  REPORT_QUALIFIED_STAGES,
  isInReportRange,
  leaderboardOwner,
  monthLabel,
  wonAmountForOpportunity,
  type ReportBook,
  type TeamRow,
} from "@/lib/reports";

const PROPOSAL_STAGES: ReadonlySet<PipelineStage> = new Set([
  "bid_submitted",
  "interview",
  "supplementing",
  "awarded",
]);

export type PersonJobStatus = "won" | "lost" | "open";

export type PersonJobRow = {
  id: string;
  href: string;
  code: string;
  name: string;
  city: string;
  type: string;
  source: string;
  signedAt: string | null;
  days: number | null;
  value: number;
  status: PersonJobStatus;
  createdAt: string;
  nextStep: string;
};

export type PersonOpenGroup = {
  id: "no_proposal" | "proposal" | "supplementing";
  label: string;
  count: number;
  oldestDays: number | null;
  hint: string;
  value: number;
};

export type PersonDetail = {
  staff: StaffMember;
  assigned: number;
  inspected: number;
  qualified: number;
  proposal: number;
  won: number;
  wonValue: number;
  lost: number;
  lostValue: number;
  stillOpen: number;
  openValue: number;
  unqualified: number;
  qualifiedNoProposal: number;
  awaitingDecision: number;
  closeRate: number;
  qualifiedClose: number;
  avgJob: number;
  byType: { label: string; count: number; value: number; avg: number }[];
  byMonth: { key: string; label: string; count: number; value: number }[];
  jobs: PersonJobRow[];
  openGroups: PersonOpenGroup[];
};

function ymd(iso: string | null | undefined) {
  return iso ? iso.slice(0, 10) : "";
}

function daysBetween(from: string | null | undefined, to: string | null | undefined) {
  const a = ymd(from);
  const b = ymd(to);
  if (!a || !b) return null;
  const ms = Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round(ms / 86_400_000));
}

function sourceLabel(value: LeadSource | "" | undefined) {
  if (!value) return "Unsourced";
  return LEAD_SOURCE_LABELS[value] ?? value;
}

function typeLabel(value: ProjectType | "" | undefined) {
  if (!value) return "Unspecified";
  return PROJECT_TYPE_LABELS[value] ?? value;
}

function cityOf(job: Job | undefined, opportunity: Opportunity) {
  const direct = job?.city?.trim() || opportunity.city?.trim();
  if (direct) return direct;
  return parseLocation(job?.location || opportunity.location || "").city || "—";
}

function proposalSent(opportunity: Opportunity, book: ReportBook, jobs: Job[]) {
  if (PROPOSAL_STAGES.has(opportunity.stage)) return true;
  return estimatesForOpportunity(opportunity, book.estimates ?? [], jobs).some(
    (estimate) =>
      estimate.status === "sent" ||
      estimate.status === "viewed" ||
      estimate.status === "accepted" ||
      estimate.status === "declined" ||
      Boolean(estimate.sentAt),
  );
}

function inspected(opportunity: Opportunity, won: boolean) {
  if (won) return true;
  if (opportunity.preBidWalkAt) return true;
  return opportunity.stage !== "pursuing";
}

function oldestHint(rows: { createdAt: string; nextStep: string }[], end: string) {
  if (!rows.length) return { oldestDays: null as number | null, hint: "None in this range" };
  let pick = rows[0];
  let days = daysBetween(pick.createdAt, end) ?? 0;
  for (const row of rows.slice(1)) {
    const age = daysBetween(row.createdAt, end) ?? 0;
    if (age > days) {
      pick = row;
      days = age;
    }
  }
  const step = pick.nextStep.trim();
  return { oldestDays: days, hint: step || `Oldest: ${days} days` };
}

/**
 * One leaderboard person's book for the report range.
 * Won, lost, qualified, and won value use the same rules as the team row.
 */
export function buildPersonDetail(
  book: ReportBook,
  staffId: string,
  range: { start: string | null; end: string },
): PersonDetail | null {
  const staff = book.staff.find((member) => member.id === staffId);
  if (!staff) return null;
  const jobs = book.jobs.filter((job) => !isDeletedJob(job));
  const estimates = book.estimates ?? [];
  const lines = book.estimateLines ?? [];
  const leads = book.opportunities.filter(
    (opportunity) =>
      isInReportRange(opportunity.createdAt, range) && leaderboardOwner(opportunity, book.staff)?.id === staffId,
  );

  let assigned = 0;
  let inspectedCount = 0;
  let qualified = 0;
  let proposal = 0;
  let won = 0;
  let wonValue = 0;
  let lost = 0;
  let lostValue = 0;
  let stillOpen = 0;
  let openValue = 0;
  let unqualified = 0;
  let qualifiedNoProposal = 0;
  let awaitingDecision = 0;
  const jobRows: PersonJobRow[] = [];
  const openBuckets: Record<PersonOpenGroup["id"], { createdAt: string; nextStep: string; value: number; delivery: string }[]> = {
    no_proposal: [],
    proposal: [],
    supplementing: [],
  };
  const typeMap = new Map<string, { count: number; value: number }>();
  const monthMap = new Map<string, { count: number; value: number }>();

  for (const opportunity of leads) {
    assigned += 1;
    const isQualified = opportunity.stage !== "unqualified" && REPORT_QUALIFIED_STAGES.has(opportunity.stage);
    const isWon = opportunity.stage !== "unqualified" && isOpportunityWon(opportunity, estimates, jobs);
    const isLost = opportunity.stage === "lost";
    const sent = proposalSent(opportunity, book, jobs) || isWon;
    const value = isWon ? wonAmountForOpportunity(opportunity, jobs, estimates, lines) : opportunity.value;
    const job = jobs.find((item) => item.opportunityId === opportunity.id);
    const wonAt = isWon ? opportunityWonAt(opportunity, estimates, jobs) : null;
    if (inspected(opportunity, isWon)) inspectedCount += 1;
    if (isQualified) qualified += 1;
    if (sent) proposal += 1;
    if (opportunity.stage === "unqualified") unqualified += 1;
    if (isLost) {
      lost += 1;
      lostValue += opportunity.value;
    }
    if (isWon) {
      won += 1;
      wonValue += value;
      const label = typeLabel(job?.projectType || opportunity.projectType);
      const type = typeMap.get(label) ?? { count: 0, value: 0 };
      type.count += 1;
      type.value += value;
      typeMap.set(label, type);
      if (wonAt) {
        const key = wonAt.slice(0, 7);
        const month = monthMap.get(key) ?? { count: 0, value: 0 };
        month.count += 1;
        month.value += value;
        monthMap.set(key, month);
      }
    }
    const open = isQualified && !isWon && !isLost;
    if (open) {
      stillOpen += 1;
      openValue += opportunity.value;
      if (isQualified && !sent) qualifiedNoProposal += 1;
      const group: PersonOpenGroup["id"] =
        opportunity.stage === "supplementing" ? "supplementing" : sent ? "proposal" : "no_proposal";
      openBuckets[group].push({
        createdAt: opportunity.createdAt,
        nextStep: opportunity.nextStep,
        value: opportunity.value,
        delivery: opportunity.deliveryMethod,
      });
    }
    if (sent && !isWon && !isLost) awaitingDecision += 1;

    const status: PersonJobStatus = isWon ? "won" : isLost ? "lost" : open ? "open" : "open";
    if (!isWon && !isLost && !open) continue;
    jobRows.push({
      id: opportunity.id,
      href: job ? `/jobs/${job.id}` : `/opportunities/${opportunity.id}`,
      code: job?.code || opportunity.code || opportunity.name,
      name: job?.name || opportunity.name,
      city: cityOf(job, opportunity),
      type: typeLabel(job?.projectType || opportunity.projectType),
      source: sourceLabel(job?.leadSource || opportunity.leadSource),
      signedAt: wonAt,
      days: isWon ? daysBetween(opportunity.createdAt, wonAt) : null,
      value,
      status,
      createdAt: opportunity.createdAt,
      nextStep: opportunity.nextStep?.trim() ?? "",
    });
  }

  const spansYears = new Set([...monthMap.keys()].map((key) => key.slice(0, 4))).size > 1;
  const insuranceWaits = openBuckets.supplementing.filter((row) => row.delivery === "insurance_claim").length;
  const supplementingLabel =
    openBuckets.supplementing.length > 0 && insuranceWaits * 2 >= openBuckets.supplementing.length
      ? "Waiting on insurance"
      : "Supplementing";
  const groupMeta: { id: PersonOpenGroup["id"]; label: string }[] = [
    { id: "no_proposal", label: "Qualified, no proposal" },
    { id: "proposal", label: "Proposal sent" },
    { id: "supplementing", label: supplementingLabel },
  ];

  return {
    staff,
    assigned,
    inspected: inspectedCount,
    qualified,
    proposal,
    won,
    wonValue,
    lost,
    lostValue,
    stillOpen,
    openValue,
    unqualified,
    qualifiedNoProposal,
    awaitingDecision,
    closeRate: closingRate(won, lost),
    qualifiedClose: qualified ? won / qualified : 0,
    avgJob: won ? wonValue / won : 0,
    byType: [...typeMap.entries()]
      .map(([label, bucket]) => ({
        label,
        count: bucket.count,
        value: bucket.value,
        avg: bucket.count ? bucket.value / bucket.count : 0,
      }))
      .sort((a, b) => b.value - a.value),
    byMonth: [...monthMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, bucket]) => ({
        key,
        label: `${monthLabel(key, spansYears)} · ${bucket.count} job${bucket.count === 1 ? "" : "s"}`,
        count: bucket.count,
        value: bucket.value,
      })),
    jobs: jobRows.sort((a, b) => (b.signedAt ?? b.createdAt).localeCompare(a.signedAt ?? a.createdAt)),
    openGroups: groupMeta.map((group) => {
      const rows = openBuckets[group.id];
      const summary = oldestHint(rows, range.end);
      return {
        id: group.id,
        label: group.label,
        count: rows.length,
        oldestDays: summary.oldestDays,
        hint: rows.length ? summary.hint : "None in this range",
        value: rows.reduce((sum, row) => sum + row.value, 0),
      };
    }),
  };
}

export function personPlacement(rows: TeamRow[], staffId: string, key: "wonValue" | "won" | "avgJob") {
  const sorted = [...rows].sort(
    (a, b) => b[key] - a[key] || b.wonValue - a.wonValue || a.staff.name.localeCompare(b.staff.name),
  );
  const index = sorted.findIndex((row) => row.staff.id === staffId);
  if (index < 0) return null;
  return {
    rank: index + 1,
    of: sorted.length,
    isFirst: index === 0,
    leader: sorted[0],
    next: sorted[index + 1] ?? null,
  };
}

export function teamRates(rows: TeamRow[]) {
  const won = rows.reduce((sum, row) => sum + row.won, 0);
  const lost = rows.reduce((sum, row) => sum + row.lost, 0);
  const qualified = rows.reduce((sum, row) => sum + row.qualified, 0);
  return {
    closeRate: closingRate(won, lost),
    qualifiedClose: qualified ? won / qualified : 0,
  };
}

export function personWonCsv(detail: PersonDetail) {
  const slug = detail.staff.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "person";
  return {
    filename: `${slug}-won-jobs.csv`,
    headers: ["Job", "Name", "City", "Type", "Lead source", "Signed", "Days to close", "Contract value"],
    rows: detail.jobs
      .filter((row) => row.status === "won")
      .map((row) => [
        row.code,
        row.name,
        row.city,
        row.type,
        row.source,
        row.signedAt ? row.signedAt.slice(0, 10) : "",
        row.days ?? "",
        row.value,
      ]),
  };
}
