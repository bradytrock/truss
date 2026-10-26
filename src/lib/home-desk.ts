import { closeoutTaskTitle, isCloseoutTaskTitle, isPayoutReviewTask } from "@/lib/commission-closeout";
import { amountForEstimate } from "@/lib/estimate-totals";
import { marketForEstimate } from "@/lib/market";
import {
  formatCurrencyFull,
  formatDate,
  formatDateShort,
  formatRelative,
  formatTime,
  localYmd,
} from "@/lib/format";
import { isJobCodeReviewTask, type JobCodeReviewNotice } from "@/lib/job-code";
import { dedupeJobsByOpportunity, duplicateLeadJobs, isDeletedJob, jobAddress, jobRecordHref } from "@/lib/job-record";
import { messagesHref } from "@/lib/job-messages";
import { pipelinePathTotals, unweightedContractValue } from "@/lib/pipeline-path";
import { digitsOnly } from "@/lib/phone";
import {
  LEAD_SOURCE_LABELS,
  LEGACY_LEAD_SOURCE_LABELS,
  isShelvedStage,
  type Activity,
  type Estimate,
  type EstimateLine,
  type Job,
  type Opportunity,
  type ReturningClientLead,
  type ScheduleEvent,
  type Task,
} from "@/lib/types";
import { WORK_COLUMN_LABELS, workColumnFor, type WorkColumn } from "@/lib/work-board";

export type DeskBucket = "calls" | "reviews" | "money";

export type DeskBadge = "CALLBACK" | "OVERDUE" | "CLOSEOUT" | "APPROVE" | "PROPOSALS" | "REVIEW";

/** Completed follow-up written when a proposal callback is cleared from the desk. */
export const PROPOSAL_FOLLOW_UP_TASK = "Proposal follow-up";

export type DeskAction =
  | { type: "link"; label: string; href: string; solid?: boolean }
  | { type: "done"; label: string; taskId: string }
  | { type: "clear"; label: string; id: string; title: string; relatedId: string }
  | { type: "call"; label: string; phone: string }
  | { type: "returning"; label: string; noticeId: string; decision: "take" | "decline" | "dismiss" | "reassigned" | "kept"; solid?: boolean }
  | { type: "redo-code"; label: string; jobId: string; code: string }
  | { type: "keep-code"; label: string; jobId: string }
  | { type: "change-code"; label: string; jobId: string; suggested: string };

export type HomeDeskRow = {
  id: string;
  badge: DeskBadge;
  buckets: DeskBucket[];
  title: string;
  titleHref?: string;
  detail: string;
  status: string;
  statusTone: "muted" | "late" | "today";
  actions: DeskAction[];
  /** How long this has been sitting, in days. Older rows sort first. */
  age: number;
};

export type HomeDeskAttention = {
  id: string;
  title: string;
  missingAddress: boolean;
  href: string;
  code: string;
  stage: string;
  issue: string;
  pm: string;
  action: DeskAction;
};

export type HomeDeskEvent = {
  id: string;
  time: string;
  title: string;
  place: string;
  duration: string;
  href: string;
};

export type HomeDeskTomorrow = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  href: string;
};

export type HomeDeskActivity = {
  id: string;
  tone: "green" | "red" | "blue" | "gray";
  title: string;
  detail: string;
  href?: string;
};

export type HomeDeskStage = {
  id: string;
  label: string;
  value: number;
  tone: "ink" | "rust" | "gold" | "quiet";
};

export type HomeDeskModel = {
  greeting: string;
  briefLabel: string;
  rows: HomeDeskRow[];
  counts: { all: number; calls: number; reviews: number; money: number };
  monthLabel: string;
  signed: { amount: number; count: number; avg: number; quota: number; daysLeft: number; percent: number };
  proposals: { count: number; amount: number };
  leads: { count: number; value: number; sources: string };
  jobs: { count: number; precon: number; inProgress: number; punch: number; missingContract: number };
  stages: HomeDeskStage[];
  pipelineWarning: { text: string; action: string; href: string } | null;
  attention: HomeDeskAttention[];
  earlier: HomeDeskEvent[];
  nowLabel: string;
  upcoming: HomeDeskEvent[];
  laterNote: string | null;
  tomorrowLabel: string;
  tomorrow: HomeDeskTomorrow[];
  activity: HomeDeskActivity[];
};

export type HomeDeskInput = {
  now?: Date;
  firstName: string;
  jobs: Job[];
  opportunities: Opportunity[];
  estimates: Estimate[];
  lines: EstimateLine[];
  tasks: Task[];
  events: ScheduleEvent[];
  activities: Activity[];
  contacts: Array<{ id: string; name: string; phone: string }>;
  customerName: (job: Job) => string;
  closeouts: Array<{ jobId: string; status: string }>;
  signed: { amount: number; count: number; avg: number };
  quota: number;
  qb: { invoiceCount: number; expenseCount: number; paymentCount: number } | null;
  accounting: Array<{ id: string; title: string; detail: string; href: string }>;
  returning: Array<{ notice: ReturningClientLead; title: string; href: string }>;
  jobCodes: JobCodeReviewNotice[];
  /** Business development seats do not use the Commissions desk. */
  showCommissions?: boolean;
};

const STAGE_TONE: Record<string, HomeDeskStage["tone"]> = {
  lead: "ink",
  proposal_sent: "rust",
  in_progress: "gold",
};

const BADGE_RANK: Record<DeskBadge, number> = {
  CALLBACK: 6,
  OVERDUE: 5,
  CLOSEOUT: 4,
  APPROVE: 3,
  PROPOSALS: 2,
  REVIEW: 1,
};

export function customerMismatchIssue(jobName: string, customerName: string) {
  const customer = customerName.trim();
  const match = jobName.trim().match(/^([A-Za-z][A-Za-z'’. -]{0,40}?)\s[—–-]\s/);
  if (!customer || !match) return null;
  const head = match[1]?.trim() ?? "";
  const headTokens = tokens(head);
  const customerTokens = tokens(customer);
  if (headTokens.length === 0 || customerTokens.length === 0) return null;
  const shared = headTokens.some((token) => customerTokens.includes(token));
  if (shared) return null;
  return `Customer is ${customer} — mismatch?`;
}

export function buildHomeDesk(input: HomeDeskInput): HomeDeskModel {
  const now = input.now ?? new Date();
  const todayKey = localYmd(now);
  const jobs = dedupedJobs(input.jobs);
  const opportunities = new Map(input.opportunities.map((opportunity) => [opportunity.id, opportunity]));
  const contacts = new Map(input.contacts.map((contact) => [contact.id, contact]));
  const rows = [
    ...taskRows(input, jobs, opportunities, contacts, now),
    ...proposalCallbacks(input, jobs, opportunities, contacts, now),
    ...closeoutRows(input, jobs),
    ...summaryRows(input),
    ...reviewRows(input),
  ].sort(compareRows);

  const active = jobs.filter((job) => job.status !== "complete" && job.status !== "on_hold");
  const openLeads = input.opportunities.filter(
    (opportunity) => opportunity.stage !== "awarded" && !isShelvedStage(opportunity.stage),
  );
  const unsigned = input.estimates.filter(
    (estimate) => !estimate.archivedAt && (estimate.status === "sent" || estimate.status === "viewed"),
  );
  const proposalAmount = unsigned.reduce(
    (sum, estimate) => sum + proposalAmountFor(estimate, input),
    0,
  );
  const path = pipelinePathTotals({
    jobs: input.jobs,
    opportunities: input.opportunities,
    estimates: input.estimates,
    lines: input.lines,
  });
  const stages = path.map((row) => ({
    id: row.column,
    label: row.label,
    value: row.value,
    tone: STAGE_TONE[row.column] ?? "quiet",
  }));
  const inProgressValue = stages.find((stage) => stage.id === "in_progress")?.value ?? 0;
  const fallbackCount = fallbackInProgress(jobs, opportunities, input);
  const pipelineWarning =
    fallbackCount > 0 && inProgressValue > Math.max(input.signed.amount * 3, 25_000)
      ? {
          text: `In progress (${formatCurrencyFull(inProgressValue)}) is far above signed work. Check the live-proposal fallback before trusting this total.`,
          action: `Review ${fallbackCount} job${fallbackCount === 1 ? "" : "s"}`,
          href: "/jobs",
        }
      : null;

  const quota = input.quota > 0 ? input.quota : 0;
  const percent = quota > 0 ? Math.min(100, Math.round((input.signed.amount / quota) * 100)) : 0;
  const latest = [...input.activities].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const updated = formatTime((latest?.createdAt || now.toISOString()));
  const dateLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const hour = now.getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const callCount = rows.filter((row) => row.buckets.includes("calls")).length;

  return {
    greeting: `${hello}, ${input.firstName.trim() || "there"}.`,
    briefLabel: `${dateLabel} · Cassio's brief, updated ${updated}`,
    rows,
    counts: {
      all: rows.length,
      calls: callCount,
      reviews: rows.filter((row) => row.buckets.includes("reviews")).length,
      money: rows.filter((row) => row.buckets.includes("money")).length,
    },
    monthLabel: `${now.toLocaleDateString("en-US", { month: "long" })} so far`,
    signed: {
      amount: input.signed.amount,
      count: input.signed.count,
      avg: input.signed.avg,
      quota,
      daysLeft: daysLeftInMonth(now),
      percent,
    },
    proposals: { count: unsigned.length, amount: proposalAmount },
    leads: {
      count: openLeads.length,
      value: openLeads.reduce((sum, opportunity) => sum + (opportunity.value || 0), 0),
      sources: sourceMix(openLeads),
    },
    jobs: {
      count: active.length,
      precon: active.filter((job) => job.status === "precon").length,
      inProgress: active.filter((job) => job.status === "in_progress").length,
      punch: active.filter((job) => job.status === "punch").length,
      missingContract: active.filter((job) => !(job.contractValue > 0)).length,
    },
    stages,
    pipelineWarning,
    attention: attentionRows(input, jobs, opportunities),
    ...agenda(input, jobs, now, todayKey, callCount),
    activity: activityRows(input, jobs, opportunities),
  };
}

function dedupedJobs(jobs: Job[]) {
  return dedupeJobsByOpportunity(jobs).filter((job) => !isDeletedJob(job));
}

function compareRows(left: HomeDeskRow, right: HomeDeskRow) {
  if (right.age !== left.age) return right.age - left.age;
  return BADGE_RANK[right.badge] - BADGE_RANK[left.badge];
}

function taskRows(
  input: HomeDeskInput,
  jobs: Job[],
  opportunities: Map<string, Opportunity>,
  contacts: Map<string, { id: string; name: string; phone: string }>,
  now: Date,
): HomeDeskRow[] {
  return input.tasks
    .filter((task) => !task.completed && !isJobCodeReviewTask(task))
    .map((task) => taskRow(task, input, jobs, opportunities, contacts, now))
    .filter((row): row is HomeDeskRow => Boolean(row));
}

function closeoutHref(input: HomeDeskInput, job: Job | undefined, payoutReview: boolean) {
  if (input.showCommissions !== false && (payoutReview || !job)) return "/commissions";
  if (job) return jobRecordHref(job.id, input.showCommissions === false ? undefined : { tab: "closeout" });
  return "/";
}

function taskRow(
  task: Task,
  input: HomeDeskInput,
  jobs: Job[],
  opportunities: Map<string, Opportunity>,
  contacts: Map<string, { id: string; name: string; phone: string }>,
  now: Date,
): HomeDeskRow | null {
  const related = relatedJob(task, jobs);
  const opportunity =
    task.relatedType === "opportunity" && task.relatedId ? opportunities.get(task.relatedId) : undefined;
  const contact = contactFor(related, opportunity, contacts);
  const late = daysPast(task.dueAt, now);
  const call = isCallTask(task.title);
  const closeout = isCloseoutTask(task.title);
  const place = related ? jobAddress(related) || related.location : "";
  const detail = [place, related?.code || opportunity?.code || "", stageBit(related, opportunity, input, now)]
    .filter(Boolean)
    .join(" · ");
  const callAction: DeskAction | null =
    call && contact?.phone && digitsOnly(contact.phone)
      ? { type: "call", label: "Call", phone: contact.phone }
      : call
        ? { type: "link", label: "Call", href: "/calls", solid: true }
        : null;

  if (closeout) {
    const payoutReview = isPayoutReviewTask(task.title);
    const href = closeoutHref(input, related, payoutReview);
    return {
      id: `task-${task.id}`,
      badge: "CLOSEOUT",
      buckets: ["reviews", "money"],
      title: task.title,
      titleHref: href,
      detail: payoutReview
        ? [related?.code, input.showCommissions === false ? "Ready for review" : "Ready for review on Commissions"]
            .filter(Boolean)
            .join(" · ")
        : detail || "Compare QuickBooks to job expenses, then release commission.",
      status: dueLabel(task.dueAt, now),
      statusTone: late > 0 ? "late" : "today",
      actions: [
        { type: "done", label: "Done", taskId: task.id },
        {
          type: "link",
          label: "Review",
          href,
          solid: true,
        },
      ],
      age: Math.max(late, 0),
    };
  }

  const actions: DeskAction[] = [
    { type: "done", label: "Done", taskId: task.id },
    ...(callAction ? [callAction] : []),
  ];

  if (late > 0) {
    return {
      id: `task-${task.id}`,
      badge: "OVERDUE",
      buckets: call ? ["calls"] : ["reviews"],
      title: task.title,
      titleHref: hrefFor(related, opportunity, task),
      detail,
      status: dueLabel(task.dueAt, now),
      statusTone: "late",
      actions,
      age: late,
    };
  }

  if (!call) {
    if (late < 0) return null;
    return {
      id: `task-${task.id}`,
      badge: "REVIEW",
      buckets: ["reviews"],
      title: task.title,
      titleHref: hrefFor(related, opportunity, task),
      detail,
      status: "Due today",
      statusTone: "today",
      actions,
      age: 0,
    };
  }
  return {
    id: `task-${task.id}`,
    badge: "CALLBACK",
    buckets: ["calls"],
    title: task.title,
    titleHref: hrefFor(related, opportunity, task),
    detail,
    status: late === 0 ? "Due today" : dueLabel(task.dueAt, now),
    statusTone: late === 0 ? "today" : "muted",
    actions,
    age: 0,
  };
}

function proposalCallbacks(
  input: HomeDeskInput,
  jobs: Job[],
  opportunities: Map<string, Opportunity>,
  contacts: Map<string, { id: string; name: string; phone: string }>,
  now: Date,
): HomeDeskRow[] {
  const covered = new Set(
    input.tasks
      .filter((task) => !task.completed)
      .flatMap((task) => [task.relatedId, task.relatedType === "job" ? relatedJob(task, jobs)?.opportunityId : null])
      .filter((id): id is string => Boolean(id)),
  );
  const rows: HomeDeskRow[] = [];
  for (const job of jobs) {
    const opportunity = job.opportunityId ? opportunities.get(job.opportunityId) : undefined;
    if (workColumnFor(job, opportunity) !== "proposal_sent") continue;
    if (covered.has(job.id) || (job.opportunityId && covered.has(job.opportunityId))) continue;
    const sentAt = proposalSentAt(job, input.estimates);
    if (!sentAt) continue;
    const waiting = daysPast(sentAt, now);
    if (waiting < 1) continue;
    if (callbackCleared(job, input.tasks, sentAt)) continue;
    const contact = job.primaryContactId ? contacts.get(job.primaryContactId) : undefined;
    const who = input.customerName(job) || contact?.name || job.name;
    const actions: DeskAction[] = [
      {
        type: "clear",
        label: "Done",
        id: `callback-${job.id}`,
        title: PROPOSAL_FOLLOW_UP_TASK,
        relatedId: job.id,
      },
    ];
    if (contact?.id || job.id) {
      actions.push({
        type: "link",
        label: "Text",
        href: messagesHref({ contact: contact?.id, job: job.id, compose: true }),
      });
    }
    if (contact?.phone && digitsOnly(contact.phone)) {
      actions.push({ type: "call", label: "Call", phone: contact.phone });
    }
    rows.push({
      id: `callback-${job.id}`,
      badge: "CALLBACK",
      buckets: ["calls"],
      title: who,
      titleHref: jobRecordHref(job.id),
      detail: [jobAddress(job) || job.location, job.code, "Proposal sent"].filter(Boolean).join(" · "),
      status: `Waiting ${waiting} day${waiting === 1 ? "" : "s"}`,
      statusTone: waiting >= 7 ? "late" : "muted",
      actions,
      age: waiting,
    });
  }
  return rows;
}

function closeoutRows(input: HomeDeskInput, jobs: Job[]): HomeDeskRow[] {
  const covered = new Set(
    input.tasks
      .filter((task) => isCloseoutTask(task.title) && task.relatedId)
      .map((task) => task.relatedId as string),
  );
  return input.closeouts
    .filter((closeout) => closeout.status === "submitted" && !covered.has(closeout.jobId))
    .map((closeout) => {
      const job = jobs.find((item) => item.id === closeout.jobId);
      const name = job ? input.customerName(job) || job.name : "Job";
      return {
        id: `closeout-${closeout.jobId}`,
        badge: "CLOSEOUT" as const,
        buckets: ["reviews", "money"] as DeskBucket[],
        title: `Review closeout — ${name}`,
        titleHref: closeoutHref(input, job, false),
        detail: [job?.code, "Compare QuickBooks to job expenses, then release commission"].filter(Boolean).join(" · "),
        status: "Due today",
        statusTone: "today" as const,
        actions: [
          {
            type: "clear" as const,
            label: "Done",
            id: `closeout-${closeout.jobId}`,
            title: closeoutTaskTitle("review", job?.code ?? ""),
            relatedId: closeout.jobId,
          },
          {
            type: "link" as const,
            label: "Review",
            href: closeoutHref(input, job, false),
            solid: true,
          },
        ],
        age: 0,
      };
    });
}

function summaryRows(input: HomeDeskInput): HomeDeskRow[] {
  const rows: HomeDeskRow[] = [];
  if (input.qb && input.qb.invoiceCount + input.qb.expenseCount + input.qb.paymentCount > 0) {
    const total = input.qb.invoiceCount + input.qb.expenseCount + input.qb.paymentCount;
    rows.push({
      id: "approve-qb",
      badge: "APPROVE",
      buckets: ["reviews", "money"],
      title: "Invoice review",
      titleHref: "/accounting?tab=review",
      detail: `${total} item${total === 1 ? "" : "s"} · ${input.qb.invoiceCount} invoice${input.qb.invoiceCount === 1 ? "" : "s"}, ${input.qb.expenseCount} expense${input.qb.expenseCount === 1 ? "" : "s"}, ${input.qb.paymentCount} payment${input.qb.paymentCount === 1 ? "" : "s"}`,
      status: "Waiting",
      statusTone: "muted",
      actions: [{ type: "link", label: "Open", href: "/accounting?tab=review", solid: true }],
      age: 0,
    });
  }
  const unsigned = input.estimates.filter(
    (estimate) => !estimate.archivedAt && (estimate.status === "sent" || estimate.status === "viewed"),
  );
  if (unsigned.length > 0) {
    const amount = unsigned.reduce((sum, estimate) => sum + proposalAmountFor(estimate, input), 0);
    rows.push({
      id: "proposals",
      badge: "PROPOSALS",
      buckets: ["money"],
      title: `${unsigned.length} proposal${unsigned.length === 1 ? "" : "s"} sent and unsigned`,
      titleHref: "/estimates",
      detail: `${formatCurrencyFull(amount)} total · oldest first`,
      status: "Follow up today",
      statusTone: "today",
      actions: [
        { type: "link", label: "View", href: "/estimates" },
        { type: "link", label: "Nudge", href: "/estimates", solid: true },
      ],
      age: 0,
    });
  }
  return rows;
}

function reviewRows(input: HomeDeskInput): HomeDeskRow[] {
  const accounting = input.accounting.map((notice) => ({
    id: `acct-${notice.id}`,
    badge: "REVIEW" as const,
    buckets: ["reviews"] as DeskBucket[],
    title: notice.title,
    titleHref: notice.href,
    detail: notice.detail,
    status: "Waiting",
    statusTone: "muted" as const,
    actions: [{ type: "link" as const, label: "Open", href: notice.href, solid: true }],
    age: 0,
  }));
  const returning = input.returning.map(({ notice, title, href }) => ({
    id: `return-${notice.id}`,
    badge: "REVIEW" as const,
    buckets: ["reviews"] as DeskBucket[],
    title,
    titleHref: href,
    detail: returningDetail(notice),
    status: "Waiting",
    statusTone: "muted" as const,
    actions: returningActions(notice),
    age: 0,
  }));
  const codes = input.jobCodes.map((notice) => ({
    id: `code-${notice.jobId}`,
    badge: "REVIEW" as const,
    buckets: ["reviews"] as DeskBucket[],
    title: notice.jobCode || notice.jobName || "Job code",
    titleHref: jobRecordHref(notice.jobId),
    detail: `Reassigned from ${notice.fromName || "the previous project manager"} to ${notice.toName || "a new project manager"}. Suggested ${notice.suggestedCode}.`,
    status: "Waiting",
    statusTone: "muted" as const,
    actions: [
      { type: "redo-code" as const, label: `Redo as ${notice.suggestedCode}`, jobId: notice.jobId, code: notice.suggestedCode },
      { type: "keep-code" as const, label: `Keep ${notice.jobCode}`, jobId: notice.jobId },
      { type: "change-code" as const, label: "Change", jobId: notice.jobId, suggested: notice.suggestedCode || notice.jobCode },
    ],
    age: 0,
  }));
  return [...accounting, ...returning, ...codes];
}

function returningDetail(notice: ReturningClientLead) {
  const when = notice.completedAt ? ` Completed ${formatDate(notice.completedAt)}.` : "";
  const jobBit = notice.previousJobCode ? ` on ${notice.previousJobCode}` : "";
  if (notice.status === "notified") {
    return `${notice.openedByName} created a job from ${notice.previousStaffName || "another project manager"}'s book${jobBit}.`;
  }
  if (notice.status === "assigned") {
    return `${notice.openedByName} assigned this past client to you${jobBit}.${when}`;
  }
  if (notice.status === "offered") {
    return `${notice.openedByName} opened this lead and did not assign it to you. You ran the last job${jobBit}.${when}`;
  }
  if (notice.openedByStaffId === notice.previousStaffId) {
    return `${notice.openedByName} assigned this past client away from themselves${jobBit}.${when}`;
  }
  return `${notice.previousStaffName || "The previous project manager"} declined or cannot take this lead${jobBit}.${when} ${notice.openedByName} kept another assignee.`;
}

function returningActions(notice: ReturningClientLead): DeskAction[] {
  if (notice.status === "offered") {
    return [
      { type: "returning", label: "Take this lead", noticeId: notice.id, decision: "take", solid: true },
      { type: "returning", label: "I don't want it", noticeId: notice.id, decision: "decline" },
    ];
  }
  if (notice.status === "assigned" || notice.status === "notified") {
    return [{ type: "returning", label: "Got it", noticeId: notice.id, decision: "dismiss" }];
  }
  if (notice.status === "pending") {
    const actions: DeskAction[] = [];
    if (notice.previousStaffId) {
      actions.push({
        type: "returning",
        label: `Reassign to ${notice.previousStaffName || "previous PM"}`,
        noticeId: notice.id,
        decision: "reassigned",
        solid: true,
      });
    }
    actions.push({ type: "returning", label: "Keep assignment", noticeId: notice.id, decision: "kept" });
    return actions;
  }
  return [];
}

function attentionRows(
  input: HomeDeskInput,
  jobs: Job[],
  opportunities: Map<string, Opportunity>,
): HomeDeskAttention[] {
  const rows: HomeDeskAttention[] = [];
  const groups = duplicateLeadJobs(input.jobs.filter((job) => !isDeletedJob(job)));
  const dropped = new Set<string>();
  for (const group of groups) {
    for (const extra of group.drop) {
      dropped.add(extra.id);
      rows.push(
        attentionRow(extra, input, opportunities, `Possible duplicate of ${group.keep.code || group.keep.name || "another job"}`, {
          type: "link",
          label: "Open",
          href: jobRecordHref(group.keep.id),
        }),
      );
    }
  }
  for (const job of jobs) {
    if (dropped.has(job.id)) continue;
    const customer = input.customerName(job);
    const mismatch = customerMismatchIssue(job.name, customer);
    if (mismatch) {
      rows.push(
        attentionRow(job, input, opportunities, mismatch, {
          type: "link",
          label: "Fix customer",
          href: jobRecordHref(job.id),
        }),
      );
      continue;
    }
    if (!hasAddress(job)) {
      rows.push(
        attentionRow(job, input, opportunities, "No street address", {
          type: "link",
          label: "Add address",
          href: jobRecordHref(job.id),
        }),
      );
    }
  }
  return rows.slice(0, 6);
}

function attentionRow(
  job: Job,
  input: HomeDeskInput,
  opportunities: Map<string, Opportunity>,
  issue: string,
  action: DeskAction,
): HomeDeskAttention {
  const opportunity = job.opportunityId ? opportunities.get(job.opportunityId) : undefined;
  return {
    id: job.id,
    title: job.name || input.customerName(job) || "Job",
    missingAddress: !hasAddress(job),
    href: jobRecordHref(job.id),
    code: job.code,
    stage: WORK_COLUMN_LABELS[workColumnFor(job, opportunity)],
    issue,
    pm: job.projectManager || "—",
    action,
  };
}

function agenda(
  input: HomeDeskInput,
  jobs: Job[],
  now: Date,
  todayKey: string,
  callCount: number,
) {
  const tomorrowKey = localYmd(addDays(now, 1));
  const todayEvents = input.events
    .filter((event) => dayKey(event.startsAt) === todayKey)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const earlier = todayEvents.filter((event) => new Date(event.endsAt).getTime() <= now.getTime()).map((event) => eventRow(event, jobs));
  const upcoming = todayEvents.filter((event) => new Date(event.endsAt).getTime() > now.getTime()).map((event) => eventRow(event, jobs));
  const tomorrowEvents = input.events
    .filter((event) => dayKey(event.startsAt) === tomorrowKey)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 3)
    .map((event) => ({
      id: event.id,
      kind: "Event",
      title: event.title,
      detail: event.location || durationLabel(event.startsAt, event.endsAt),
      href: "/calendar",
    }));
  const tomorrowTasks = input.tasks
    .filter((task) => !task.completed && task.dueAt.slice(0, 10) === tomorrowKey)
    .slice(0, 3)
    .map((task) => {
      const similar = input.tasks.filter(
        (other) =>
          other.id !== task.id &&
          !other.completed &&
          other.dueAt.slice(0, 10) === tomorrowKey &&
          (other.assignee === task.assignee || (other.relatedId && other.relatedId === task.relatedId)),
      ).length;
      const who = task.assignee || "Unassigned";
      return {
        id: task.id,
        kind: "Task",
        title: task.title,
        detail: similar >= 2 ? `${who} · ${similar} similar tasks, merge?` : who,
        href: "/tasks",
      };
    });
  const tomorrowDate = addDays(now, 1);
  return {
    earlier: earlier.slice(0, 4),
    nowLabel: `NOW · ${formatTime(now.toISOString())}`,
    upcoming: upcoming.slice(0, 3),
    laterNote:
      upcoming.length === 0
        ? callCount > 0
          ? "Nothing else on the calendar today. Good window to work the callback list."
          : "Nothing else on the calendar today."
        : null,
    tomorrowLabel: `Tomorrow · ${tomorrowDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    tomorrow: [...tomorrowEvents, ...tomorrowTasks].slice(0, 4),
  };
}

function activityRows(
  input: HomeDeskInput,
  jobs: Job[],
  opportunities: Map<string, Opportunity>,
): HomeDeskActivity[] {
  return [...input.activities]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6)
    .map((activity) => {
      const job = activity.entityType === "job" ? jobs.find((item) => item.id === activity.entityId) : undefined;
      const opportunity =
        activity.entityType === "opportunity" ? opportunities.get(activity.entityId) : undefined;
      const code = job?.code || opportunity?.code || "";
      return {
        id: activity.id,
        tone: activityTone(activity),
        title: activity.body,
        detail: [activity.author, code, formatRelative(activity.createdAt)].filter(Boolean).join(" · "),
        href: job ? jobRecordHref(job.id) : opportunity ? `/opportunities/${opportunity.id}` : undefined,
      };
    });
}

function activityTone(activity: Activity): HomeDeskActivity["tone"] {
  const text = `${activity.type} ${activity.body}`.toLowerCase();
  if (text.includes("complete")) return "green";
  if (text.includes("signed") || text.includes("accepted")) return "red";
  if (activity.type === "stage_change" || text.includes("moved") || text.includes("sold")) return "blue";
  return "gray";
}

function fallbackInProgress(
  jobs: Job[],
  opportunities: Map<string, Opportunity>,
  input: HomeDeskInput,
) {
  let count = 0;
  for (const job of jobs) {
    const opportunity = job.opportunityId ? opportunities.get(job.opportunityId) : undefined;
    if (workColumnFor(job, opportunity) !== "in_progress") continue;
    if (job.contractValue > 0) continue;
    const value = unweightedContractValue({
      job,
      opportunity,
      estimates: input.estimates,
      lines: input.lines,
    });
    if (value > 0) count += 1;
  }
  return count;
}

function proposalAmountFor(estimate: Estimate, input: HomeDeskInput) {
  return amountForEstimate(
    estimate,
    input.lines,
    marketForEstimate(estimate, input.jobs, input.opportunities),
  );
}

function eventRow(event: ScheduleEvent, jobs: Job[]): HomeDeskEvent {
  const job = event.jobId ? jobs.find((item) => item.id === event.jobId) : undefined;
  return {
    id: event.id,
    time: formatTime(event.startsAt),
    title: event.title,
    place: event.location || (job ? jobAddress(job) || job.location : ""),
    duration: durationLabel(event.startsAt, event.endsAt),
    href: "/calendar",
  };
}

function relatedJob(task: Task, jobs: Job[]) {
  if (task.relatedType === "job" && task.relatedId) return jobs.find((job) => job.id === task.relatedId);
  if (task.relatedType === "opportunity" && task.relatedId) {
    return jobs.find((job) => job.opportunityId === task.relatedId);
  }
  return undefined;
}

function contactFor(
  job: Job | undefined,
  opportunity: Opportunity | undefined,
  contacts: Map<string, { id: string; name: string; phone: string }>,
) {
  const id = job?.primaryContactId || opportunity?.primaryContactId;
  return id ? contacts.get(id) : undefined;
}

function hrefFor(job: Job | undefined, opportunity: Opportunity | undefined, task: Task) {
  if (job) return jobRecordHref(job.id);
  if (opportunity) return `/opportunities/${opportunity.id}`;
  if (task.relatedType === "opportunity" && task.relatedId) return `/opportunities/${task.relatedId}`;
  return "/tasks";
}

function stageBit(
  job: Job | undefined,
  opportunity: Opportunity | undefined,
  input: HomeDeskInput,
  now: Date,
) {
  if (!job && opportunity) return WORK_COLUMN_LABELS[workColumnFor({ status: "precon", opportunityId: opportunity.id, deletedAt: null }, opportunity)];
  if (!job) return "";
  const signedToday = input.estimates.some((estimate) => {
    if (estimate.archivedAt || estimate.status !== "accepted" || !estimate.acceptedAt) return false;
    const matches = estimate.jobId === job.id || (job.opportunityId && estimate.opportunityId === job.opportunityId);
    return matches && estimate.acceptedAt.slice(0, 10) === localYmd(now);
  });
  if (signedToday) return "signed today";
  const column: WorkColumn = workColumnFor(job, opportunity);
  return WORK_COLUMN_LABELS[column];
}

function proposalSentAt(job: Job, estimates: Estimate[]) {
  const stamps = estimates
    .filter(
      (estimate) =>
        !estimate.archivedAt &&
        (estimate.status === "sent" || estimate.status === "viewed") &&
        (estimate.jobId === job.id || (job.opportunityId && estimate.opportunityId === job.opportunityId)) &&
        estimate.sentAt,
    )
    .map((estimate) => estimate.sentAt as string)
    .sort();
  return stamps[0] ?? null;
}

function callbackCleared(job: Job, tasks: Task[], sentAt: string) {
  const sent = sentAt.slice(0, 10);
  return tasks.some((task) => {
    if (!task.completed || !clearsProposalCallback(task.title)) return false;
    const touches =
      task.relatedId === job.id || Boolean(job.opportunityId && task.relatedId === job.opportunityId);
    if (!touches) return false;
    return task.dueAt.slice(0, 10) >= sent;
  });
}

function clearsProposalCallback(title: string) {
  return isCallTask(title) || title === PROPOSAL_FOLLOW_UP_TASK || title.startsWith(`${PROPOSAL_FOLLOW_UP_TASK} `);
}

function dueLabel(dueAt: string, now: Date) {
  const late = daysPast(dueAt, now);
  if (late === 0) return "Due today";
  return `Due ${formatDateShort(dueAt)}`;
}

function daysPast(iso: string, now: Date) {
  const due = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return 0;
  const dueDate = new Date(`${due}T12:00:00`);
  const today = new Date(`${localYmd(now)}T12:00:00`);
  if (Number.isNaN(dueDate.getTime())) return 0;
  return Math.round((today.getTime() - dueDate.getTime()) / 86_400_000);
}

function daysLeftInMonth(now: Date) {
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.max(0, last - now.getDate());
}

function hasAddress(job: Job) {
  return Boolean(job.street?.trim() || job.city?.trim() || job.location?.trim());
}

function tokens(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

function isCallTask(title: string) {
  return /\bcalls?\b/i.test(title);
}

function isCloseoutTask(title: string) {
  return isCloseoutTaskTitle(title);
}

function sourceMix(opportunities: Opportunity[]) {
  const counts = new Map<string, number>();
  for (const opportunity of opportunities) {
    const raw = opportunity.leadSource || "";
    const label =
      (raw && LEAD_SOURCE_LABELS[raw as keyof typeof LEAD_SOURCE_LABELS]) ||
      LEGACY_LEAD_SOURCE_LABELS[raw] ||
      "";
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (!total) return "";
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([label, count]) => `${label} ${Math.round((count / total) * 100)}%`)
    .join(" · ");
}

function durationLabel(startsAt: string, endsAt: string) {
  const minutes = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

function dayKey(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return localYmd(date);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
