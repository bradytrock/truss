"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import {
  ArrowUpRight,
  Briefcase,
  CalendarClock,
  CircleDollarSign,
  FileText,
  Receipt,
  Trophy,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorBanner, LoadingScreen, PageHeader } from "@/components/page-chrome";
import { JobStatusBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import {
  daysUntil,
  formatCurrency,
  formatCurrencyFull,
  formatDateShort,
  formatRelative,
  formatTime,
  greeting,
  localYmd,
} from "@/lib/format";
import { derivedInvoiceStatus, invoiceBalance, sumLines } from "@/lib/money";
import { PIPELINE_STAGES, STAGE_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const crm = useCrm();

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
    const activeJobs = crm.jobs.filter(
      (job) => job.status !== "complete" && job.status !== "on_hold"
    );
    const activeValue = activeJobs.reduce((sum, job) => sum + job.contractValue, 0);
    const winRate = closed.length === 0 ? 0 : Math.round((awarded.length / closed.length) * 100);
    const proposals = crm.estimates.filter(
      (estimate) => estimate.status === "sent" || estimate.status === "viewed"
    );
    const proposalValue = proposals.reduce(
      (sum, estimate) =>
        sum + sumLines(crm.estimateLines.filter((line) => line.estimateId === estimate.id)),
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
    };
  }, [crm.estimateLines, crm.estimates, crm.events, crm.invoiceLines, crm.invoices, crm.jobs, crm.opportunities, crm.payments]);

  const upcomingTasks = crm.tasks
    .filter((task) => !task.completed)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, 6);

  const feed = [...crm.activities]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);

  if (!crm.hydrated) return <LoadingScreen />;

  return (
    <div className="space-y-6">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.resetDemo()} />
      ) : null}
      <PageHeader
        title={`${greeting()}, ${crm.user.name.split(" ")[0] || "there"}`}
        description={
          crm.viewer?.role === "business_development"
            ? "All jobs in the company, plus the restricted BD report: open jobs, closed YTD, referral partners by PM, and YTD revenue."
            : crm.viewer?.role === "project_manager" || crm.viewer?.role === "superintendent"
              ? "Your jobs, your contact book, and the work assigned to you."
              : crm.viewer?.role === "team_lead" || crm.viewer?.role === "team_admin"
                ? "Jobs and contacts for your team. Login As a teammate to inspect their book, or open Reports for team activity."
                : "Open pipeline, proposals out, AR, and today's field calendar — the loop from bid to job photo."
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={<CircleDollarSign className="size-4" />}
          label="Open pipeline"
          value={formatCurrency(stats.pipelineValue)}
          hint={`${stats.openCount} active pursuits · ${formatCurrency(stats.weighted)} weighted`}
        />
        <Kpi
          icon={<CalendarClock className="size-4" />}
          label="Bids due this week"
          value={String(stats.bidsThisWeek.length)}
          hint={
            stats.bidsThisWeek[0]
              ? `Next: ${[...stats.bidsThisWeek].sort((a, b) => (a.bidDueAt ?? "").localeCompare(b.bidDueAt ?? ""))[0]?.name}`
              : "No bid dates in the next seven days"
          }
        />
        <Kpi
          icon={<Briefcase className="size-4" />}
          label="Work in the field"
          value={formatCurrency(stats.activeValue)}
          hint={`${stats.activeJobs.length} jobs in precon, construction, or punch`}
        />
        <Kpi
          icon={<Trophy className="size-4" />}
          label="Win rate"
          value={`${stats.winRate}%`}
          hint={`${stats.awardedCount} awarded / ${stats.closedCount} closed pursuits`}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Kpi
          icon={<FileText className="size-4" />}
          label="Proposals out"
          value={String(stats.proposals.length)}
          hint={
            stats.proposals.length
              ? `${formatCurrency(stats.proposalValue)} sitting with owners`
              : "No sent proposals waiting on a decision"
          }
        />
        <Kpi
          icon={<Receipt className="size-4" />}
          label="AR outstanding"
          value={formatCurrency(stats.ar)}
          hint="Sent, partial, and overdue invoices"
        />
        <Kpi
          icon={<CalendarClock className="size-4" />}
          label="On today's calendar"
          value={String(stats.todayEvents.length)}
          hint={
            stats.todayEvents[0]
              ? `Next: ${formatTime(stats.todayEvents[0].startsAt)} ${stats.todayEvents[0].title}`
              : "Nothing scheduled today"
          }
        />
      </section>

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
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(4, (item.value / stats.maxStage) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            <Link
              href="/pipeline"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Open pipeline board
              <ArrowUpRight className="size-3.5" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Bids due</CardTitle>
            <CardDescription>Hard dates the estimating desk cannot miss.</CardDescription>
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
                            {crm.getClient(opportunity.clientId)?.name} ·{" "}
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

      <section className="grid gap-4 lg:grid-cols-2">
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
          <h2 className="text-base font-medium">Active jobs</h2>
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
                    <CardTitle className="text-sm">{job.name}</CardTitle>
                    <JobStatusBadge status={job.status} />
                  </div>
                  <CardDescription>
                    {crm.getClient(job.clientId)?.name} · {job.location}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between text-sm">
                  <span className="font-semibold tabular-nums">
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

function Kpi({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          {icon}
          {label}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}
