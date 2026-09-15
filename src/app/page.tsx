"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { isBusinessDevelopment } from "@/lib/bd";
import { BdRoiPanel } from "@/components/bd-roi";
import { HomeOnboarding } from "@/components/home-onboarding";
import { HomeDashboardCanvas } from "@/components/home-dashboard-canvas";
import { HomeToday } from "@/components/home-today";
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
import {
  buildHomeBrief,
  buildHomeFocus,
  jobsMissingContract,
  jobsMissingStart,
  openCallbacks,
  overdueDays,
  preconJobs,
  sourceShares,
  unsignedProposals,
} from "@/lib/home-today";

export default function HomePage() {
  const crm = useCrm();
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

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

  const upcomingTasks = crm.tasks
    .filter((task) => !task.completed)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, 6);

  const feed = [...crm.activities]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);

  const today = useMemo(() => {
    const callbacks = openCallbacks(crm.tasks);
    const proposals = unsignedProposals(crm.estimates);
    const active = stats.activeJobs;
    const precon = preconJobs(active);
    const missingContract = jobsMissingContract(active);
    const missingStart = jobsMissingStart(precon);
    const firstName = crm.user.name.split(" ")[0] || "there";
    const callbackRows = callbacks.slice(0, 8).map((task) => {
      const related =
        task.relatedType === "job"
          ? crm.getJob(task.relatedId ?? "")
          : task.relatedType === "opportunity"
            ? crm.getOpportunity(task.relatedId ?? "")
            : undefined;
      const contactId =
        related && "primaryContactId" in related ? related.primaryContactId : null;
      const contact = crm.getContact(contactId);
      const who = contact?.name || (related ? crm.customerName(related) : task.assignee) || "Callback";
      const street =
        related && "street" in related && typeof related.street === "string" ? related.street : "";
      const city = related && "city" in related && typeof related.city === "string" ? related.city : "";
      const location = (related && "location" in related ? related.location : "") || [street, city].filter(Boolean).join(", ");
      const href =
        task.relatedType === "job" && task.relatedId
          ? `/jobs?job=${task.relatedId}`
          : task.relatedType === "opportunity" && task.relatedId
            ? `/opportunities/${task.relatedId}`
            : "/calendar";
      return {
        id: task.id,
        title: task.title,
        who,
        sub: location || task.assignee || "Open task",
        daysLate: overdueDays(task.dueAt),
        phone: contact?.phone ?? "",
        href,
      };
    });
    const oldest = callbackRows[0];
    const brief = buildHomeBrief({
      firstName,
      callbackCount: callbacks.length,
      oldestCallback: oldest
        ? { name: oldest.who, dueAt: callbacks[0]?.dueAt ?? "" }
        : null,
      proposalCount: proposals.length,
      preconWithoutStart: missingStart.length,
      jobsWithoutContract: missingContract.length,
    });
    const focus = buildHomeFocus({
      callbackCount: callbacks.length,
      oldestDays: oldest?.daysLate ?? 0,
      proposalCount: proposals.length,
      jobsWithoutContract: missingContract.length,
      names: [...new Set(callbackRows.map((row) => row.who))],
    });
    const inProgress = active.filter((job) => job.status === "in_progress").length;
    return {
      brief,
      focus,
      callbackRows,
      activeJobRows: active.slice(0, 8).map((job) => ({
        id: job.id,
        name: job.name,
        who: crm.customerName(job) || job.name,
        code: job.code,
        location: job.location || [job.street, job.city].filter(Boolean).join(", "),
        status: job.status,
        contractValue: job.contractValue,
      })),
      stages: [
        { label: "Leads", count: stats.openCount, note: stats.pipelineValue > 0 ? formatCurrency(stats.pipelineValue) : "Value not estimated" },
        { label: "Proposals out", count: proposals.length, note: proposals.length ? "Awaiting signature" : "None waiting" },
        { label: "Signed", count: salesDashboard.closedCount, note: salesDashboard.closedCount ? formatCurrency(salesDashboard.closedAmount) : "None this month" },
        { label: "Preconstruction", count: precon.length, note: missingStart.length ? "Needs start dates" : "Scheduled" },
        { label: "In production", count: inProgress, note: inProgress ? "On the board" : "None active" },
      ],
      sources: sourceShares(salesDashboard.bySource),
      signedSpark: salesDashboard.byCloseDate.map((item) => item.value),
      missingContract: missingContract.length,
      preconCount: precon.length,
      inProgress,
      proposalCount: proposals.length,
      proposalHint: proposals.length
        ? "Sent and still unsigned"
        : "Nothing waiting on a signature",
    };
  }, [crm, salesDashboard, stats]);

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

  function renderHomeModule(id: HomeModuleId): ReactNode {
    switch (id) {
      case "salesKpis":
        return (
          <div className="grid h-full gap-3 sm:grid-cols-3">
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
            action={<RelatedListLink href="/pipeline">Pipeline</RelatedListLink>}
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
            <p className="px-3 py-3 text-sm text-[#181818]">
              {stats.qb.invoiceCount + stats.qb.expenseCount + stats.qb.paymentCount} items waiting ·{" "}
              {stats.qb.invoiceCount} invoices, {stats.qb.expenseCount} expenses, {stats.qb.paymentCount}{" "}
              payments
            </p>
          </RelatedList>
        );
      case "accountingNotices":
        return (
          <Card className="rounded-sm border-[#c9c9c9] shadow-[0_2px_2px_rgba(0,0,0,0.05)]">
            <CardHeader className="border-b border-[#c9c9c9] bg-[#f3f3f3]">
              <CardTitle className="font-sans text-sm font-semibold text-[#181818]">Accounting needs you</CardTitle>
              <CardDescription>
                Open the file on the job, make the change, leave a comment, and send it back. Replies
                happen on that file — not on Approve.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <ul className="divide-y">
                {reviewNotices.map((notice) => (
                  <li key={`${notice.item.kind}-${notice.item.id}`} className="py-3 first:pt-1">
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
            </CardContent>
          </Card>
        );
      case "returningClients":
        return (
          <Card className="rounded-sm border-[#c9c9c9] shadow-[0_2px_2px_rgba(0,0,0,0.05)]">
            <CardHeader className="border-b border-[#c9c9c9] bg-[#f3f3f3]">
              <CardTitle className="font-sans text-sm font-semibold text-[#181818]">Returning clients</CardTitle>
              <CardDescription>
                Past clients called back. The previous project manager is asked first. Company admins
                decide only after they decline, or when that seat is locked.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              <ul className="divide-y">
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
            </CardContent>
          </Card>
        );
      case "pipelinePath":
        return (
          <RelatedList
            title="Pipeline path"
            description="Unweighted contract value by stage. Open the board to move records."
            action={<RelatedListLink href="/pipeline">Open board</RelatedListLink>}
          >
            <div className="p-3">
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
            action={<RelatedListLink href="/pipeline">View all</RelatedListLink>}
          >
            {stats.bidsThisWeek.length === 0 ? (
              <p className="px-3 py-6 text-sm text-[#706e6b]">
                Nothing due in the next seven days.
              </p>
            ) : (
              <ul className="divide-y divide-[#e5e5e5]">
                {stats.bidsThisWeek
                  .slice()
                  .sort((a, b) => (a.bidDueAt ?? "").localeCompare(b.bidDueAt ?? ""))
                  .map((opportunity) => {
                    const due = daysUntil(opportunity.bidDueAt);
                    return (
                      <li key={opportunity.id} className="px-3 py-2.5 hover:bg-[#f3f3f3]">
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
          <RelatedList title="Today’s work" description="Open tasks on your desk.">
            {upcomingTasks.length === 0 ? (
              <p className="px-3 py-6 text-sm text-[#706e6b]">All caught up. No open tasks.</p>
            ) : (
              <ul className="divide-y divide-[#e5e5e5]">
                {upcomingTasks.map((task) => {
                  const overdue = (daysUntil(task.dueAt) ?? 0) < 0;
                  return (
                    <li key={task.id} className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-[#f3f3f3]">
                      <Checkbox
                        checked={task.completed}
                        onCheckedChange={() => crm.toggleTask(task.id)}
                        className="mt-0.5"
                        aria-label={`Complete ${task.title}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug text-[#181818]">{task.title}</p>
                        <p className={cn("text-xs", overdue ? "text-destructive" : "text-[#706e6b]")}>
                          {task.assignee} · {formatDateShort(task.dueAt)}
                          {overdue ? " · overdue" : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
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
            <div className="px-3 py-3 text-sm text-[#181818]">
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
              <p className="px-3 py-6 text-sm text-[#706e6b]">
                Nothing logged yet. Open a record and capture the last owner conversation.
              </p>
            ) : (
              <ul className="divide-y divide-[#e5e5e5]">
                {feed.map((activity) => (
                  <li key={activity.id} className="px-3 py-2.5 hover:bg-[#f3f3f3]">
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
              <p className="px-3 py-6 text-sm text-[#706e6b]">No active jobs in your book.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="border-b border-[#c9c9c9] bg-[#f3f3f3] text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">
                    <tr>
                      <th className="px-3 py-2">Job</th>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">PM</th>
                      <th className="px-3 py-2 text-right">Contract</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e5e5e5]">
                    {stats.activeJobs.map((job) => (
                      <tr key={job.id} className="hover:bg-[#f3f3f3]">
                        <td className="px-3 py-2">
                          <Link href={`/jobs/${job.id}`} className="font-semibold text-[#0176d3] hover:underline">
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
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-[#181818]">
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
  const staffId = crm.effectiveStaff?.id || crm.user.staffId || "anon";

  const customize = hasLeads ? (
    <>
      <Button
        type="button"
        variant={editing ? "default" : "outline"}
        className="rounded-lg border-[rgba(28,25,22,0.08)] bg-white"
        onClick={() => setEditing((value) => !value)}
      >
        {editing ? "Done" : "Customize"}
      </Button>
      <Button
        nativeButton={false}
        className="rounded-lg bg-[#1d1d1f] text-white hover:bg-black"
        render={<Link href="/pipeline" />}
      >
        View pipeline
      </Button>
    </>
  ) : null;

  return (
    <div className="space-y-4">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}

      {!hasLeads ? (
        <>
          <PageHeader
            eyebrow="Home"
            title={`${greeting()}, ${crm.user.name.split(" ")[0] || "there"}`}
            description="Your home shows today’s brief, callbacks, and pipeline once the first lead is in."
          />
          <HomeOnboarding viewer={crm.effectiveStaff} />
        </>
      ) : (
        <HomeToday
          key={staffId}
          staffId={staffId}
          brief={today.brief}
          focus={today.focus}
          signed={{
            amount: salesDashboard.closedAmount,
            count: salesDashboard.closedCount,
            avg: salesDashboard.avgDeal,
            spark: today.signedSpark,
          }}
          proposals={{ count: today.proposalCount, hint: today.proposalHint }}
          jobs={{
            count: stats.activeJobs.length,
            precon: today.preconCount,
            inProgress: today.inProgress,
            missingContract: today.missingContract,
          }}
          callbacks={today.callbackRows}
          activeJobs={today.activeJobRows}
          stages={today.stages}
          sources={today.sources}
          closeRate={stats.winRate}
          quota={salesDashboard.quota}
          activities={feed.map((activity) => ({
            id: activity.id,
            title: activity.body,
            sub: activity.author,
            when: formatRelative(activity.createdAt),
          }))}
          onCompleteTask={(id) => void crm.toggleTask(id)}
          customize={customize}
        />
      )}

      {hasLeads && editing ? (
        <HomeDashboardCanvas
          key={`${crm.user.companyId}:${staffId}`}
          companyId={crm.user.companyId || "local"}
          staffId={staffId}
          editing={editing}
          availableIds={availableHomeModules({
            hasLeads,
            isAccountant: crm.effectiveStaff?.role === "accountant",
            isBd: Boolean(crm.viewer && isBusinessDevelopment(crm.viewer.role)),
            canViewAccounting: Boolean(crm.effectiveStaff && canViewAccounting(crm.effectiveStaff.role)),
            hasAccountingNotices: reviewNotices.length > 0,
            hasReturningClients: returningNotices.length > 0,
          })}
          salesIntro={
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">
                  Classic modules
                </p>
                <p className="text-xs text-[#706e6b]">
                  Hide, resize, or rearrange the older sales tiles. Today stays the default home.
                </p>
              </div>
            </div>
          }
          renderModule={(id) => renderHomeModule(id)}
        />
      ) : null}
    </div>
  );
}
