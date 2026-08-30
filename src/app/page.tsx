"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorBanner, LoadingScreen, Metric, MetricStrip, PageHeader, RecordCode } from "@/components/page-chrome";
import { JobStatusBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import {
  daysUntil,
  formatCurrency,
  formatCurrencyFull,
  formatDate,
  formatDateShort,
  formatRelative,
  formatTime,
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
import { canManageSettings, canViewAccounting } from "@/lib/visibility";
import { isBusinessDevelopment } from "@/lib/bd";
import { BdRoiPanel } from "@/components/bd-roi";

export default function HomePage() {
  const crm = useCrm();
  const [decidingId, setDecidingId] = useState<string | null>(null);

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

  const upcomingTasks = crm.tasks
    .filter((task) => !task.completed)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, 6);

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

  const pendingReturning = useMemo(() => {
    if (!crm.viewer || !canManageSettings(crm.viewer.role, crm.viewer)) return [];
    return (crm.returningClientLeads ?? []).filter((notice) => notice.status === "pending");
  }, [crm.returningClientLeads, crm.viewer]);

  async function decideReturning(noticeId: string, decision: "reassigned" | "kept") {
    setDecidingId(noticeId);
    try {
      await crm.decideReturningClientLead(noticeId, decision);
    } finally {
      setDecidingId(null);
    }
  }

  if (!crm.hydrated) return <LoadingScreen />;

  return (
    <div className="space-y-6">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <PageHeader
        title={`${greeting()}, ${crm.user.name.split(" ")[0] || "there"}`}
        description={
          crm.effectiveStaff?.role === "accountant"
            ? "Books for every job: expenses, receipts, and what still needs to be typed into QuickBooks."
            : crm.effectiveStaff?.role === "business_development"
            ? "Your pipeline, the agents you brought in, and ROI. Assign the work — you still keep the numbers."
            : crm.effectiveStaff?.role === "project_manager" || crm.effectiveStaff?.role === "superintendent"
              ? "Your jobs, your contact book, and the work assigned to you."
              : crm.effectiveStaff?.role === "team_lead" || crm.effectiveStaff?.role === "team_admin"
                ? "Jobs and contacts for your team. Login As a teammate to inspect their book, or open Reports for team activity."
                : "Open pipeline, proposals out, AR, and today's field calendar — restoration and remodel from lead to job photo."
        }
      />

      <MetricStrip className="sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Open pipeline"
          value={formatCurrency(stats.pipelineValue)}
          hint={`${stats.openCount} open leads · ${formatCurrency(stats.weighted)} weighted`}
        />
        <Metric
          label="Proposals due this week"
          value={String(stats.bidsThisWeek.length)}
          hint={
            stats.bidsThisWeek[0]
              ? `Next: ${[...stats.bidsThisWeek].sort((a, b) => (a.bidDueAt ?? "").localeCompare(b.bidDueAt ?? ""))[0]?.name}`
              : "None in the next seven days"
          }
        />
        <Metric
          label="Work in the field"
          value={formatCurrency(stats.activeValue)}
          hint={`${stats.activeJobs.length} jobs in precon, production, or punch`}
        />
        <Metric
          label="Win rate"
          value={`${stats.winRate}%`}
          hint={`${stats.awardedCount} sold / ${stats.closedCount} closed`}
        />
      </MetricStrip>

      {crm.viewer && isBusinessDevelopment(crm.viewer.role) ? (
        <BdRoiPanel state={crm.book} viewer={crm.viewer} />
      ) : null}

      <MetricStrip className="sm:grid-cols-3">
        <Metric
          label="Proposals out"
          value={String(stats.proposals.length)}
          hint={
            stats.proposals.length
              ? `${formatCurrency(stats.proposalValue)} with homeowners`
              : "Nothing waiting on a signature"
          }
        />
        <Metric
          label="AR outstanding"
          value={formatCurrency(stats.ar)}
          hint="Sent, partial, and overdue"
        />
        <Metric
          label="On today's calendar"
          value={String(stats.todayEvents.length)}
          hint={
            stats.todayEvents[0]
              ? `Next: ${formatTime(stats.todayEvents[0].startsAt)} ${stats.todayEvents[0].title}`
              : "Nothing scheduled today"
          }
        />
      </MetricStrip>

      {crm.effectiveStaff && canViewAccounting(crm.effectiveStaff.role) ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Approve for QuickBooks</CardTitle>
            <CardDescription>
              Open from Accounting. Approve queues the Web Connector, or tag the project manager so they
              can fix the file on the job and send it back.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              {stats.qb.invoiceCount + stats.qb.expenseCount + stats.qb.paymentCount} items waiting ·{" "}
              {stats.qb.invoiceCount} invoices, {stats.qb.expenseCount} expenses, {stats.qb.paymentCount}{" "}
              payments
            </p>
            <Button nativeButton={false} render={<Link href="/accounting/approve" />}>
              Open Approve
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {reviewNotices.length > 0 ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Accounting needs you</CardTitle>
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
                    className="text-sm font-medium hover:underline"
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
      ) : null}

      {pendingReturning.length > 0 ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Returning clients</CardTitle>
            <CardDescription>
              Someone opened a lead on a past client&apos;s phone and did not send it back to that
              project manager. You decide.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <ul className="divide-y">
              {pendingReturning.map((notice) => {
                const opportunity = crm.getOpportunity(notice.opportunityId);
                const job = notice.jobId ? crm.getJob(notice.jobId) : undefined;
                const href = job
                  ? `/jobs?job=${job.id}`
                  : `/opportunities/${notice.opportunityId}`;
                const busy = decidingId === notice.id;
                return (
                  <li key={notice.id} className="py-3 first:pt-1">
                    <Link href={href} className="text-sm font-medium hover:underline">
                      {opportunity?.code || opportunity?.name || "Lead"}
                      {opportunity?.name && opportunity.code ? ` · ${opportunity.name}` : ""}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {notice.openedByName} kept their assignment. Previous project manager was{" "}
                      {notice.previousStaffName}
                      {notice.previousJobCode ? ` on ${notice.previousJobCode}` : ""}.
                      {notice.completedAt
                        ? ` Completed ${formatDate(notice.completedAt)}.`
                        : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
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
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="border-b">
            <CardTitle>Pipeline by stage</CardTitle>
            <CardDescription>
              Unweighted contract value sitting in front of award. Drag cards on the pipeline board
              to move work.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-1">
            {stats.byStage.map((item) => (
              <div key={item.stage} className="grid gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{STAGE_LABELS[item.stage]}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatCurrency(item.value)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden bg-muted">
                  <div
                    className="h-full bg-foreground"
                    style={{ width: `${Math.max(4, (item.value / stats.maxStage) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            <Link href="/pipeline" className="text-sm font-medium text-primary hover:underline">
              Open pipeline board →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Proposals due</CardTitle>
            <CardDescription>Dates the estimating desk cannot miss.</CardDescription>
          </CardHeader>
          <CardContent className="pt-1">
            {stats.bidsThisWeek.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">
                Nothing due in the next seven days. Check the board for later submissions.
              </p>
            ) : (
              <ul className="divide-y">
                {stats.bidsThisWeek
                  .slice()
                  .sort((a, b) => (a.bidDueAt ?? "").localeCompare(b.bidDueAt ?? ""))
                  .map((opportunity) => {
                    const due = daysUntil(opportunity.bidDueAt);
                    return (
                      <li key={opportunity.id} className="py-2.5 first:pt-0">
                        <Link
                          href={`/opportunities/${opportunity.id}`}
                          className="block hover:underline"
                        >
                          <p className="text-sm font-medium">{opportunity.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {crm.customerName(opportunity)} ·{" "}
                            {formatCurrency(opportunity.value)}
                          </p>
                        </Link>
                        <p
                          className={cn(
                            "mt-1 text-xs tabular-nums",
                            due !== null && due <= 2 ? "font-medium text-destructive" : "text-muted-foreground"
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
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>This week on the desk</CardTitle>
            <CardDescription>Walks, follow-ups, and closeout that still sit with preconstruction.</CardDescription>
          </CardHeader>
          <CardContent className="pt-1">
            {upcomingTasks.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">All caught up. Nothing open.</p>
            ) : (
              <ul className="space-y-2">
                {upcomingTasks.map((task) => {
                  const overdue = (daysUntil(task.dueAt) ?? 0) < 0;
                  return (
                    <li key={task.id} className="flex items-start gap-2.5">
                      <Checkbox
                        checked={task.completed}
                        onCheckedChange={() => crm.toggleTask(task.id)}
                        className="mt-0.5"
                        aria-label={`Complete ${task.title}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug">{task.title}</p>
                        <p
                          className={cn(
                            "text-xs",
                            overdue ? "text-destructive" : "text-muted-foreground"
                          )}
                        >
                          {task.assignee} · {formatDateShort(task.dueAt)}
                          {overdue ? " · overdue" : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Training</CardTitle>
            <CardDescription>
              Roofing certification pack. Chapter tests at {COURSE.passScore}%, exam at {COURSE.finalPassScore}%.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-3">
            {(() => {
              const training = overallProgress(staffProgress(crm.trainingProgress, crm.user.staffId));
              return (
                <>
                  <p className="text-sm">
                    {training.read} of {training.totalLessons} lessons · {training.passedChapters} of{" "}
                    {training.chapterCount} chapter tests
                    {training.certified ? " · certified" : ""}
                  </p>
                  {crm.trainingBulletins[0] ? (
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      Bulletin: {crm.trainingBulletins[0].title}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">No company training notes this week.</p>
                  )}
                  <Link href="/training" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
                    Open training
                  </Link>
                </>
              );
            })()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Calls, walks, and stage moves across the book of work.</CardDescription>
          </CardHeader>
          <CardContent className="pt-1">
            {feed.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">
                Nothing logged yet. Open a record and capture the last owner conversation.
              </p>
            ) : (
              <ul className="space-y-3">
                {feed.map((activity) => (
                  <li key={activity.id}>
                    <p className="text-sm leading-snug">{activity.body}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {activity.author} · {formatRelative(activity.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-heading text-lg font-medium tracking-tight">Active jobs</h2>
          <Link href="/jobs" className="text-sm text-primary hover:underline">
            All jobs
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {stats.activeJobs.map((job) => (
            <Link key={job.id} href={`/jobs/${job.id}`}>
              <Card className="h-full transition-colors hover:bg-muted/40">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <RecordCode code={job.code} />
                      <CardTitle className="mt-0.5 text-sm">{job.name}</CardTitle>
                    </div>
                    <JobStatusBadge status={job.status} />
                  </div>
                  <CardDescription>
                    {crm.customerName(job)} · {job.location}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between text-sm">
                  <span className="font-heading text-base font-medium tabular-nums">
                    {formatCurrencyFull(job.contractValue)}
                  </span>
                  <span className="text-xs text-muted-foreground">{job.projectManager}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

