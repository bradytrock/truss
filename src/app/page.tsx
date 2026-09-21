"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { CreateTaskDialog } from "@/components/create-task-dialog";
import { HomeDayCalendar } from "@/components/home-day-calendar";
import { TaskRow } from "@/components/task-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBanner, LoadingScreen, PageHeader, RecordCode } from "@/components/page-chrome";
import { JobStatusBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import {
  daysUntil,
  formatCurrency,
  formatCurrencyFull,
  formatDate,
  formatDateShort,
  formatRelative,
  greeting,
  localYmd,
} from "@/lib/format";
import { derivedInvoiceStatus, invoiceBalance } from "@/lib/money";
import { amountForEstimate } from "@/lib/estimate-totals";
import { marketForEstimate } from "@/lib/market";
import { PIPELINE_STAGES, STAGE_LABELS } from "@/lib/types";
import { dedupeJobsByOpportunity, isDeletedJob } from "@/lib/job-record";
import { cn } from "@/lib/utils";
import { COURSE, overallProgress, staffProgress } from "@/lib/training/engine";
import { qbQueue } from "@/lib/job-financials";
import { itemTitle, jobDocumentHref, pmReviewNotices } from "@/lib/qb-review";
import { canViewAccounting } from "@/lib/visibility";
import { actionableReturningClientNotices } from "@/lib/returning-client";
import { actionableJobCodeReviews } from "@/lib/job-code";
import { isBusinessDevelopment } from "@/lib/bd";
import { BdRoiPanel } from "@/components/bd-roi";
import { HomeOnboarding } from "@/components/home-onboarding";
import { AutomationConfirmations } from "@/components/automation-confirmations";
import { HomeDashboardCanvas } from "@/components/home-dashboard-canvas";
import {
  DashboardChart,
  HomeAreaChart,
  HomeDonut,
  HomeGauge,
  HomeKpiTile,
  PipelinePath,
  RelatedList,
  RelatedListLink,
} from "@/components/home-panels";
import {
  amountClosedBySource,
  closedWonThisMonth,
  dealsByCloseDate,
  formatCompactCurrency,
  homeGoalScope,
  homeQuota,
  wonDeals,
} from "@/lib/home-dashboard";
import { availableHomeModules, type HomeModuleId } from "@/lib/home-layout";
import { filterTasks, sortTasks, taskRelatedHref, taskRelatedLabel } from "@/lib/task-desk";
import type { Task } from "@/lib/types";

export default function HomePage() {
  const crm = useCrm();
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decidingCodeId, setDecidingCodeId] = useState<string | null>(null);
  const [changeJobId, setChangeJobId] = useState<string | null>(null);
  const [changeCode, setChangeCode] = useState("");
  const [editing, setEditing] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const stats = useMemo(() => {
    const open = crm.opportunities.filter(
      (opportunity) => opportunity.stage !== "awarded" && opportunity.stage !== "lost"
    );
    const closed = crm.opportunities.filter(
      (opportunity) => opportunity.stage === "awarded" || opportunity.stage === "lost"
    );
    const awarded = crm.opportunities.filter((opportunity) => opportunity.stage === "awarded");
    const pipelineValue = open.reduce((sum, opportunity) => sum + opportunity.value, 0);
    const weighted = open.reduce(
      (sum, opportunity) => sum + opportunity.value * (opportunity.winProbability / 100),
      0
    );
    const bidsThisWeek = open.filter((opportunity) => {
      const days = daysUntil(opportunity.bidDueAt);
      return days !== null && days >= 0 && days <= 7;
    });
    const activeJobs = dedupeJobsByOpportunity(crm.jobs).filter(
      (job) => job.status !== "complete" && job.status !== "on_hold" && !isDeletedJob(job)
    );
    const activeValue = activeJobs.reduce((sum, job) => sum + job.contractValue, 0);
    const winRate = closed.length === 0 ? 0 : Math.round((awarded.length / closed.length) * 100);
    const proposals = crm.estimates.filter(
      (estimate) => estimate.status === "sent" || estimate.status === "viewed"
    );
    const proposalValue = proposals.reduce(
      (sum, estimate) =>
        sum +
        amountForEstimate(
          estimate,
          crm.estimateLines,
          marketForEstimate(estimate, crm.jobs, crm.opportunities),
        ),
      0
    );
    const ar = crm.invoices.reduce((sum, invoice) => {
      const status = derivedInvoiceStatus(invoice, crm.invoiceLines, crm.payments);
      if (status === "void" || status === "draft" || status === "paid") return sum;
      return sum + invoiceBalance(invoice.id, crm.invoiceLines, crm.payments);
    }, 0);
    const todayKey = localYmd(new Date());
    const todayEvents = crm.events
      .filter((event) => localYmd(new Date(event.startsAt)) === todayKey)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const byStage = PIPELINE_STAGES.filter(
      (stage) => stage !== "awarded" && stage !== "lost"
    ).map((stage) => ({
      stage,
      value: open
        .filter((opportunity) => opportunity.stage === stage)
        .reduce((sum, opportunity) => sum + opportunity.value, 0),
    }));
    const maxStage = Math.max(...byStage.map((item) => item.value), 1);
    return {
      openCount: open.length,
      pipelineValue,
      weighted,
      bidsThisWeek,
      activeJobs,
      activeValue,
      winRate,
      awardedCount: awarded.length,
      closedCount: closed.length,
      byStage,
      maxStage,
      proposals,
      proposalValue,
      ar,
      todayEvents,
      qb: qbQueue({
        invoices: crm.invoices,
        invoiceLines: crm.invoiceLines,
        payments: crm.payments,
        expenses: crm.expenses,
      }),
    };
  }, [crm.estimateLines, crm.estimates, crm.events, crm.expenses, crm.invoiceLines, crm.invoices, crm.jobs, crm.opportunities, crm.payments]);

  const salesDashboard = useMemo(() => {
    const viewer = crm.effectiveStaff;
    const { ownerIds, roster } = homeGoalScope(viewer, crm.staff);
    const deals = wonDeals({
      jobs: crm.jobs,
      estimates: crm.estimates,
      estimateLines: crm.estimateLines,
      opportunities: crm.opportunities,
      staff: crm.staff,
      ownerIds,
    });
    const closed = closedWonThisMonth(deals);
    const quota = homeQuota(viewer, crm.company, roster);
    return {
      openPipeline: stats.pipelineValue,
      closedCount: closed.count,
      closedAmount: closed.amount,
      avgDeal: closed.avg,
      quota,
      byCloseDate: dealsByCloseDate(deals, 14),
      bySource: amountClosedBySource(deals),
    };
  }, [
    crm.company,
    crm.effectiveStaff,
    crm.estimateLines,
    crm.estimates,
    crm.jobs,
    crm.opportunities,
    crm.staff,
    stats.pipelineValue,
  ]);

  const upcomingTasks = sortTasks(filterTasks(crm.tasks, "open", crm.effectiveStaff?.name || crm.user.name || "")).slice(
    0,
    8,
  );

  const feed = [...crm.activities]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);

  const reviewNotices = useMemo(() => {
    const staff = crm.effectiveStaff;
    if (!staff) return [];
    return pmReviewNotices({
      staff,
      roster: crm.staff,
      jobs: crm.jobs,
      invoices: crm.invoices,
      expenses: crm.expenses,
      payments: crm.payments,
      comments: crm.qbReviewComments ?? [],
    });
  }, [
    crm.effectiveStaff,
    crm.expenses,
    crm.invoices,
    crm.jobs,
    crm.payments,
    crm.qbReviewComments,
    crm.staff,
  ]);

  const returningNotices = useMemo(
    () => actionableReturningClientNotices(crm.returningClientLeads, crm.effectiveStaff),
    [crm.effectiveStaff, crm.returningClientLeads],
  );

  const jobCodeReviews = useMemo(
    () => actionableJobCodeReviews(crm.tasks, crm.jobs, crm.effectiveStaff),
    [crm.effectiveStaff, crm.jobs, crm.tasks],
  );

  async function decideReturning(
    noticeId: string,
    decision: "take" | "decline" | "reassigned" | "kept" | "dismiss",
  ) {
    setDecidingId(noticeId);
    try {
      await crm.decideReturningClientLead(noticeId, decision);
    } finally {
      setDecidingId(null);
    }
  }

  async function decideJobCode(
    jobId: string,
    decision: "redo" | "keep" | "change",
    code?: string,
  ) {
    setDecidingCodeId(jobId);
    try {
      const ok = await crm.decideJobCodeReview(jobId, decision, code);
      if (ok) {
        setChangeJobId(null);
        setChangeCode("");
      }
    } finally {
      setDecidingCodeId(null);
    }
  }

  function renderHomeModule(id: HomeModuleId): ReactNode {
    switch (id) {
      case "salesKpis":
        return (
          <div className="grid h-full gap-4 sm:grid-cols-3">
            <HomeKpiTile
              label="Amount open"
              value={formatCompactCurrency(salesDashboard.openPipeline)}
              hint={`${stats.openCount} open leads`}
            />
            <HomeKpiTile
              label="Closed won"
              value={String(salesDashboard.closedCount)}
              hint={formatCurrency(salesDashboard.closedAmount)}
            />
            <HomeKpiTile
              label="Average deal"
              value={
                salesDashboard.closedCount > 0
                  ? formatCompactCurrency(salesDashboard.avgDeal)
                  : "—"
              }
              hint="Signed this month"
            />
          </div>
        );
      case "closedWonGauge":
        return (
          <DashboardChart
            title="Closed won sales"
            description="Month-to-date signed contracts vs quota"
          >
            <HomeGauge
              value={salesDashboard.closedAmount}
              target={salesDashboard.quota}
              format={formatCompactCurrency}
            />
          </DashboardChart>
        );
      case "dealsByCloseDate":
        return (
          <DashboardChart
            title="Deals by close date"
            description="Signed contract value over the last 14 days"
            action={<RelatedListLink href="/jobs">Pipeline</RelatedListLink>}
          >
            <HomeAreaChart
              items={salesDashboard.byCloseDate}
              format={formatCompactCurrency}
              empty="No signed deals in the last two weeks."
            />
          </DashboardChart>
        );
      case "closedBySource":
        return (
          <DashboardChart
            title="Amount closed by lead source"
            description="This month’s signed work by source"
            action={<RelatedListLink href="/reports">Sources</RelatedListLink>}
          >
            <HomeDonut
              items={salesDashboard.bySource}
              format={formatCompactCurrency}
              empty="No sourced closed-won this month."
            />
          </DashboardChart>
        );
      case "bdRoi":
        return crm.viewer ? <BdRoiPanel state={crm.book} viewer={crm.viewer} /> : null;
      case "qbApprove":
        return (
          <RelatedList
            title="Invoice review"
            description="Approve invoices here. Open Expense review for receipts next to the QuickBooks fields."
            action={<RelatedListLink href="/accounting?tab=review">Invoice review</RelatedListLink>}
          >
            <p className="px-5 py-4 text-sm text-[#181818]">
              {stats.qb.invoiceCount + stats.qb.expenseCount + stats.qb.paymentCount} items waiting ·{" "}
              {stats.qb.invoiceCount} invoices, {stats.qb.expenseCount} expenses, {stats.qb.paymentCount}{" "}
              payments
            </p>
          </RelatedList>
        );
      case "accountingNotices":
        return (
          <RelatedList
            title="Accounting needs you"
            description="Open the file on the job, make the change, leave a comment, and send it back."
          >
            <ul className="divide-y divide-black/5 px-5 pb-2">
              {reviewNotices.map((notice) => (
                <li key={`${notice.item.kind}-${notice.item.id}`} className="py-3">
                  <Link
                    href={jobDocumentHref(notice.jobId, notice.item.kind, notice.item.id)}
                    className="text-sm font-semibold text-[#0176d3] hover:underline"
                  >
                    {itemTitle(notice.item)}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {notice.reason === "tagged" ? "You were tagged. " : "Sent back for a change. "}
                    {notice.preview}
                  </p>
                </li>
              ))}
            </ul>
          </RelatedList>
        );
      case "returningClients":
        return (
          <RelatedList
            title="Returning clients"
            description="Past clients called back. The previous project manager is asked first."
          >
              <ul className="divide-y divide-black/5 px-5 pb-2">
                {returningNotices.map((notice) => {
                  const opportunity = crm.getOpportunity(notice.opportunityId);
                  const job = notice.jobId ? crm.getJob(notice.jobId) : undefined;
                  const href = job ? `/jobs?job=${job.id}` : `/opportunities/${notice.opportunityId}`;
                  const busy = decidingId === notice.id;
                  const when = notice.completedAt ? ` Completed ${formatDate(notice.completedAt)}.` : "";
                  const jobBit = notice.previousJobCode ? ` on ${notice.previousJobCode}` : "";
                  return (
                    <li key={notice.id} className="py-3 first:pt-1">
                      <Link href={href} className="text-sm font-semibold text-[#0176d3] hover:underline">
                        {opportunity?.code || opportunity?.name || "Lead"}
                        {opportunity?.name && opportunity.code ? ` · ${opportunity.name}` : ""}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {notice.status === "assigned"
                          ? `${notice.openedByName} assigned this past client to you${jobBit}.${when}`
                          : notice.status === "offered"
                            ? `${notice.openedByName} opened this lead and did not assign it to you. You ran the last job${jobBit}.${when}`
                            : notice.openedByStaffId === notice.previousStaffId
                              ? `${notice.openedByName} assigned this past client away from themselves${jobBit}.${when}`
                              : `${notice.previousStaffName || "The previous project manager"} declined or cannot take this lead${jobBit}.${when} ${notice.openedByName} kept another assignee.`}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {notice.status === "offered" ? (
                          <>
                            <Button size="sm" disabled={busy} onClick={() => void decideReturning(notice.id, "take")}>
                              {busy ? "Saving…" : "Take this lead"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void decideReturning(notice.id, "decline")}
                            >
                              I don&apos;t want it
                            </Button>
                          </>
                        ) : null}
                        {notice.status === "assigned" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void decideReturning(notice.id, "dismiss")}
                          >
                            {busy ? "Saving…" : "Got it"}
                          </Button>
                        ) : null}
                        {notice.status === "pending" ? (
                          <>
                            {notice.previousStaffId ? (
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() => void decideReturning(notice.id, "reassigned")}
                              >
                                {busy ? "Saving…" : `Reassign to ${notice.previousStaffName}`}
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => void decideReturning(notice.id, "kept")}
                            >
                              Keep assignment
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
          </RelatedList>
        );
      case "jobCodes":
        return (
          <RelatedList
            title="Job codes"
            description="A project manager changed. Redo the code with their initials, keep it, or type a new one."
          >
            <ul className="divide-y divide-black/5 px-5 pb-2">
              {jobCodeReviews.map((notice) => {
                const busy = decidingCodeId === notice.jobId;
                const changing = changeJobId === notice.jobId;
                return (
                  <li key={notice.jobId} className="py-3 first:pt-1">
                    <Link
                      href={`/jobs?job=${notice.jobId}`}
                      className="text-sm font-semibold text-[#0176d3] hover:underline"
                    >
                      {notice.jobCode || notice.jobName || "Job"}
                      {notice.jobName && notice.jobCode ? ` · ${notice.jobName}` : ""}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Reassigned from {notice.fromName || "the previous project manager"} to{" "}
                      {notice.toName || "a new project manager"}. Current code {notice.fromCode || notice.jobCode}.
                      Suggested {notice.suggestedCode}.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void decideJobCode(notice.jobId, "redo", notice.suggestedCode)}
                      >
                        {busy ? "Saving…" : `Redo as ${notice.suggestedCode}`}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void decideJobCode(notice.jobId, "keep")}
                      >
                        Keep {notice.jobCode}
                      </Button>
                      {changing ? (
                        <>
                          <Input
                            value={changeCode}
                            onChange={(event) => setChangeCode(event.target.value)}
                            placeholder="New job code"
                            className="h-8 w-36"
                            aria-label="New job code"
                          />
                          <Button
                            size="sm"
                            disabled={busy || !changeCode.trim()}
                            onClick={() => void decideJobCode(notice.jobId, "change", changeCode)}
                          >
                            Save code
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => {
                              setChangeJobId(null);
                              setChangeCode("");
                            }}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setChangeJobId(notice.jobId);
                            setChangeCode(notice.suggestedCode || notice.jobCode);
                          }}
                        >
                          Change
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </RelatedList>
        );
      case "pipelinePath":
        return (
          <RelatedList
            title="Pipeline path"
            description="Unweighted contract value by stage. Open the board to move records."
            action={<RelatedListLink href="/jobs">Open board</RelatedListLink>}
          >
            <div className="px-5 pb-5">
              <PipelinePath
                stages={stats.byStage.map((item) => ({
                  key: item.stage,
                  label: STAGE_LABELS[item.stage],
                  value: formatCurrency(item.value),
                  active: item.value > 0 && item.value === Math.max(...stats.byStage.map((s) => s.value)),
                }))}
              />
            </div>
          </RelatedList>
        );
      case "proposalsDue":
        return (
          <RelatedList
            title="Proposals due"
            description="Estimating dates that cannot slip."
            action={<RelatedListLink href="/jobs">View all</RelatedListLink>}
          >
            {stats.bidsThisWeek.length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#706e6b]">
                Nothing due in the next seven days.
              </p>
            ) : (
              <ul className="divide-y divide-black/5">
                {stats.bidsThisWeek
                  .slice()
                  .sort((a, b) => (a.bidDueAt ?? "").localeCompare(b.bidDueAt ?? ""))
                  .map((opportunity) => {
                    const due = daysUntil(opportunity.bidDueAt);
                    return (
                      <li key={opportunity.id} className="px-5 py-2.5 hover:bg-[#f8fafc]">
                        <Link href={`/opportunities/${opportunity.id}`} className="block">
                          <p className="text-sm font-semibold text-[#0176d3] hover:underline">
                            {opportunity.name}
                          </p>
                          <p className="text-xs text-[#706e6b]">
                            {crm.customerName(opportunity)} · {formatCurrency(opportunity.value)}
                          </p>
                        </Link>
                        <p
                          className={cn(
                            "mt-1 text-xs tabular-nums",
                            due !== null && due <= 2 ? "font-semibold text-destructive" : "text-[#706e6b]",
                          )}
                        >
                          {due === 0
                            ? "Due today"
                            : due === 1
                              ? "Due tomorrow"
                              : `Due ${formatDateShort(opportunity.bidDueAt)}`}
                        </p>
                      </li>
                    );
                  })}
              </ul>
            )}
          </RelatedList>
        );
      case "todaysWork":
        return (
          <RelatedList
            title="Tasks"
            description="Assigned work with a deadline. Check it off, or open it to edit."
            action={
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-xs font-semibold text-[#0176d3] hover:underline"
                  onClick={() => setCreateTaskOpen(true)}
                >
                  New task
                </button>
                <RelatedListLink href="/tasks">All tasks</RelatedListLink>
              </div>
            }
          >
            {upcomingTasks.length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#706e6b]">
                All caught up.{" "}
                <button
                  type="button"
                  className="font-semibold text-[#0176d3] hover:underline"
                  onClick={() => setCreateTaskOpen(true)}
                >
                  Add a task
                </button>
              </p>
            ) : (
              <ul className="divide-y divide-black/5">
                {upcomingTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    relatedLabel={taskRelatedLabel(task, crm.jobs, crm.opportunities)}
                    relatedHref={taskRelatedHref(task)}
                    onToggle={() => void crm.toggleTask(task.id)}
                    onOpen={() => setEditingTask(task)}
                  />
                ))}
              </ul>
            )}
          </RelatedList>
        );
      case "calendarDay":
        return (
          <RelatedList
            title="Today"
            description="Your day on the calendar."
            action={<RelatedListLink href="/calendar">Open calendar</RelatedListLink>}
          >
            <HomeDayCalendar day={new Date()} events={crm.events} />
          </RelatedList>
        );
      case "training": {
        const training = overallProgress(staffProgress(crm.trainingProgress, crm.user.staffId));
        return (
          <RelatedList
            title="Training"
            description={`Chapter tests ${COURSE.passScore}% · exam ${COURSE.finalPassScore}%.`}
            action={<RelatedListLink href="/training">Open</RelatedListLink>}
          >
            <div className="px-5 py-4 text-sm text-[#181818]">
              <p>
                {training.read} of {training.totalLessons} lessons · {training.passedChapters} of{" "}
                {training.chapterCount} chapter tests
                {training.certified ? " · certified" : ""}
              </p>
              <p className="mt-2 text-xs text-[#706e6b]">
                {crm.trainingBulletins[0]
                  ? `Bulletin: ${crm.trainingBulletins[0].title}`
                  : "No company training notes this week."}
              </p>
            </div>
          </RelatedList>
        );
      }
      case "recentActivity":
        return (
          <RelatedList
            title="Recent activity"
            description="Calls, walks, and stage moves across the book."
          >
            {feed.length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#706e6b]">
                Nothing logged yet. Open a record and capture the last owner conversation.
              </p>
            ) : (
              <ul className="divide-y divide-black/5">
                {feed.map((activity) => (
                  <li key={activity.id} className="px-5 py-2.5 hover:bg-[#f8fafc]">
                    <p className="text-sm leading-snug text-[#181818]">{activity.body}</p>
                    <p className="mt-0.5 text-xs text-[#706e6b]">
                      {activity.author} · {formatRelative(activity.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </RelatedList>
        );
      case "activeJobs":
        return (
          <RelatedList
            title="Active jobs"
            description="Jobs in precon, production, or punch."
            action={<RelatedListLink href="/jobs">View all</RelatedListLink>}
          >
            {stats.activeJobs.length === 0 ? (
              <p className="px-5 py-6 text-sm text-[#706e6b]">No active jobs in your book.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="border-b border-black/6 text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">
                    <tr>
                      <th className="px-5 py-2">Job</th>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">PM</th>
                      <th className="px-5 py-2 text-right">Contract</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {stats.activeJobs.map((job) => (
                      <tr key={job.id} className="hover:bg-[#f8fafc]">
                        <td className="px-5 py-2">
                          <Link href={`/jobs?job=${job.id}`} className="font-semibold text-[#0176d3] hover:underline">
                            {job.name}
                          </Link>
                          <div className="mt-0.5">
                            <RecordCode code={job.code} />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-[#706e6b]">
                          {crm.customerName(job)}
                          <div className="text-xs">{job.location}</div>
                        </td>
                        <td className="px-3 py-2">
                          <JobStatusBadge status={job.status} />
                        </td>
                        <td className="px-3 py-2 text-[#706e6b]">{job.projectManager}</td>
                        <td className="px-5 py-2 text-right font-semibold tabular-nums text-[#181818]">
                          {formatCurrencyFull(job.contractValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </RelatedList>
        );
      default:
        return null;
    }
  }

  if (!crm.hydrated) return <LoadingScreen />;

  const hasLeads = crm.opportunities.length > 0;

  return (
    <div className="space-y-4">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <div className="[&>div]:border-b-0 [&>div]:pb-1 [&_h1]:text-[1.75rem] [&_h1]:tracking-tight">
      <PageHeader
        title={`${greeting()}, ${crm.user.name.split(" ")[0] || "there"}`}
        description={
          crm.effectiveStaff?.role === "accountant"
            ? "Accounting queues for expenses, receipts, and QuickBooks."
            : "Pipeline, closed-won, today’s tasks, and the day on the calendar."
        }
        actions={
          hasLeads ? (
            <>
              <Button
                type="button"
                size="sm"
                variant={editing ? "default" : "outline"}
                className="h-8 rounded-xl text-xs font-semibold"
                onClick={() => setEditing((value) => !value)}
              >
                {editing ? "Done" : "Customize"}
              </Button>
              <Button
                nativeButton={false}
                size="sm"
                className="h-8 rounded-xl bg-[#0176d3] text-xs font-semibold text-white hover:bg-[#014486]"
                render={<Link href="/jobs" />}
              >
                View pipeline
              </Button>
            </>
          ) : null
        }
      />
      </div>

      <AutomationConfirmations />

      {!hasLeads ? <HomeOnboarding viewer={crm.effectiveStaff} /> : null}

      {hasLeads ? (
        <HomeDashboardCanvas
          key={`${crm.user.companyId}:${crm.effectiveStaff?.id ?? crm.user.staffId}`}
          companyId={crm.user.companyId || "local"}
          staffId={crm.effectiveStaff?.id || crm.user.staffId || "anon"}
          editing={editing}
          availableIds={availableHomeModules({
            hasLeads,
            isAccountant: crm.effectiveStaff?.role === "accountant",
            isBd: Boolean(crm.viewer && isBusinessDevelopment(crm.viewer.role)),
            canViewAccounting: Boolean(crm.effectiveStaff && canViewAccounting(crm.effectiveStaff.role)),
            hasAccountingNotices: reviewNotices.length > 0,
            hasReturningClients: returningNotices.length > 0,
            hasJobCodeReviews: jobCodeReviews.length > 0,
          })}
          salesIntro={
            <div className="flex flex-wrap items-end justify-between gap-2 px-1">
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">
                  Sales
                </p>
                <p className="text-xs text-[#706e6b]">
                  Pipeline and closed-won for{" "}
                  {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </p>
              </div>
              <RelatedListLink href="/reports">Open reports</RelatedListLink>
            </div>
          }
          renderModule={(id) => renderHomeModule(id)}
        />
      ) : null}

      <CreateTaskDialog open={createTaskOpen} onOpenChange={setCreateTaskOpen} />
      <CreateTaskDialog
        open={Boolean(editingTask)}
        onOpenChange={(open) => {
          if (!open) setEditingTask(null);
        }}
        task={editingTask}
      />
    </div>
  );
}
