"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PipelineBars, ShareBar, StackedShare, sourceSwatch, VerticalBars } from "@/components/reports-charts";
import { EmptyState, ErrorBanner, LoadingScreen, Metric, MetricStrip, PageHeader } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { formatCurrency, formatCurrencyFull, formatDate } from "@/lib/format";
import {
  DATE_PRESETS,
  REPORT_TABS,
  buildPerformance,
  formatShare,
  rangeLabel,
  type DatePreset,
  type ReportTab,
  type WorkflowRow,
} from "@/lib/reports";
import { BdRoiPanel } from "@/components/bd-roi";
import { SEAT_ROLE_LABELS } from "@/lib/types";
import { accessScope, canSeeTeamPerformance, canViewReports } from "@/lib/visibility";
import { isBusinessDevelopment } from "@/lib/bd";

const SCOPE_COPY = {
  company: "Company-wide numbers for every job this office can see.",
  bd: "Your pipeline, the agents you brought in, and ROI. Credit stays with the person who opened the lead.",
  team: "Jobs and leads owned by your team.",
  own: "Limited to your own jobs and leads.",
} as const;

export default function ReportsPage() {
  const crm = useCrm();
  const viewer = crm.effectiveStaff;
  const [preset, setPreset] = useState<DatePreset>("ytd");
  const [tab, setTab] = useState<ReportTab>("jobs");
  const [pipelineMode, setPipelineMode] = useState<"funnel" | "bars">("funnel");

  const showTeam = Boolean(viewer && canSeeTeamPerformance(viewer.role));
  const tabs = REPORT_TABS.filter((item) => !item.teamOnly || showTeam);

  const report = useMemo(() => {
    if (!viewer) return null;
    return buildPerformance(
      {
        staff: crm.staff,
        jobs: crm.jobs,
        opportunities: crm.opportunities,
        contacts: crm.contacts,
      },
      viewer,
      preset
    );
  }, [crm.contacts, crm.jobs, crm.opportunities, crm.staff, preset, viewer]);

  if (!crm.hydrated) return <LoadingScreen />;

  if (!viewer || !canViewReports(viewer.role)) {
    return (
      <EmptyState
        title="Reports are restricted"
        description="Project managers and field seats work from their own jobs. Company admin, business development, team leads, and accounting run reports — each only on the book their seat can see."
        action={
          <Link href="/" className="text-sm font-medium text-primary hover:underline">
            Back to home
          </Link>
        }
      />
    );
  }

  if (!report) return <LoadingScreen />;

  const data = report;
  const scope = accessScope(viewer.role);
  const isBd = isBusinessDevelopment(viewer.role);
  const money = (value: number) => formatCurrencyFull(value);
  const compact = (value: number) => formatCurrency(value);
  const activeTab = tabs.some((item) => item.id === tab) ? tab : "jobs";

  function exportCurrent() {
    const stamp = data.range.end;
    if (activeTab === "leads") {
      downloadCsv(
        `lead-performance-${stamp}.csv`,
        ["Lead source", "Incoming", "Qualified", "Won", "Avg won", "Total won"],
        data.bySource.map((row) => [row.source, row.incoming, row.qualified, row.won, row.avgWon, row.wonValue])
      );
      return;
    }
    if (activeTab === "team") {
      downloadCsv(
        `team-performance-${stamp}.csv`,
        ["Owner", "Won value", "Jobs won", "Close rate", "Avg job"],
        data.byTeam.map((row) => [row.staff.name, row.wonValue, row.won, row.closeRate, row.avgJob])
      );
      return;
    }
    if (activeTab === "lost") {
      downloadCsv(
        `lost-jobs-${stamp}.csv`,
        ["Job", "Location", "Source", "Owner", "Value", "Reason"],
        data.lostJobs.map((row) => [row.name, row.location, row.source, row.owner, row.value, row.reason])
      );
      return;
    }
    if (activeTab === "pipeline") {
      downloadCsv(
        `pipeline-${stamp}.csv`,
        ["Stage", "Jobs", "Value"],
        data.pipeline.map((row) => [row.label, row.count, row.value])
      );
      return;
    }
    downloadCsv(
      `job-report-${stamp}.csv`,
      ["Type", "Win rate", "Won", "Lost", "Pending", "Won value", "Lost value", "Pending value", "Share"],
      data.byProjectType.map((row) => [
        row.label,
        row.winRate,
        row.won,
        row.lost,
        row.pending,
        row.wonValue,
        row.lostValue,
        row.pendingValue,
        row.share,
      ])
    );
  }

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.resetDemo()} />
      ) : null}

      <PageHeader
        eyebrow="Reports"
        title={isBd ? "Business development ROI" : "Performance"}
        description={
          isBd
            ? "Your numbers and the company BD book. Credit stays with the person who opened the lead."
            : SCOPE_COPY[scope]
        }
        actions={
          isBd ? undefined : (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <p className="text-sm text-muted-foreground">Showing {rangeLabel(report.range)}</p>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" size="sm" />}>
                <CalendarDays />
                {DATE_PRESETS.find((item) => item.id === preset)?.label}
                <ChevronDown />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {DATE_PRESETS.map((item) => (
                  <DropdownMenuItem key={item.id} onClick={() => setPreset(item.id)}>
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button type="button" variant="outline" onClick={exportCurrent}>
              <Download />
              Export data
            </Button>
          </div>
          )
        }
      />

      {isBd || scope === "company" ? <BdRoiPanel state={crm.book} viewer={viewer} /> : null}

      {isBd ? null : (
      <Tabs value={activeTab} onValueChange={(value) => setTab(value as ReportTab)}>
        <TabsList variant="line" className="h-auto w-full flex-wrap justify-start rounded-none bg-transparent p-0">
          {tabs.map((item) => (
            <TabsTrigger key={item.id} value={item.id} className="flex-none px-3">
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="jobs" className="mt-5 space-y-5">
          <MetricStrip className="sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Total jobs" value={String(report.kpis.totalJobs)} hint="Jobs started in this range" />
            <Metric label="Total value" value={compact(report.kpis.totalValue)} hint="Combined contract value" />
            <Metric label="Average job value" value={compact(report.kpis.avgJob)} hint="Typical contract in this range" />
            <Metric label="Jobs lost" value={String(report.kpis.lostCount)} hint="Lost leads in this range" />
            <Metric label="Job lost average" value={compact(report.kpis.lostAvg)} hint="Avg. value of lost work" />
          </MetricStrip>
          <div className="grid gap-4 xl:grid-cols-3">
            <ChartCard title="Total revenue" hint="Cumulative value sold">
              <VerticalBars items={runningTotal(report.monthlyWon)} format={compact} />
            </ChartCard>
            <ChartCard title="Job count" hint="Jobs sold by month">
              <VerticalBars
                items={report.monthlyWon.map((row) => ({ label: row.label, value: row.count }))}
                format={(value) => String(Math.round(value))}
              />
            </ChartCard>
            <ChartCard title="Revenue by month" hint="Value sold">
              <VerticalBars
                items={report.monthlyWon.map((row) => ({ label: row.label, value: row.value }))}
                format={compact}
              />
            </ChartCard>
          </div>
          <Panel title="Overall metrics by project type" description="Win rate and value for work started in this range.">
            <ProjectTypeTable rows={report.byProjectType} money={money} />
          </Panel>
        </TabsContent>

        <TabsContent value="leads" className="mt-5 space-y-5">
          <MetricStrip className="sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Incoming jobs" value={String(report.kpis.incoming)} hint="Leads opened in this range" />
            <Metric label="Avg. days to sold" value={report.kpis.daysToSold.toFixed(1)} hint="Lead created to job start" />
            <Metric label="New lead to qualified" value={formatShare(report.kpis.newToQualified)} hint="Moved past Lead" />
            <Metric label="Qualified close rate" value={formatShare(report.kpis.qualifiedClose)} hint="Qualified leads sold" />
            <Metric label="Close rate" value={formatShare(report.kpis.closeRate)} hint="Won vs lost in range" />
          </MetricStrip>
          <Panel title="Lead performance" description="Where work came from, and how much of it sold.">
            <div className="mb-4">
              <StackedShare items={report.bySource.map((row) => ({ label: row.source, value: row.incoming }))} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead source</TableHead>
                  <TableHead className="text-right">Incoming</TableHead>
                  <TableHead className="text-right">Qualified</TableHead>
                  <TableHead className="text-right">Won</TableHead>
                  <TableHead className="text-right">Avg. won value</TableHead>
                  <TableHead className="text-right">Total won value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.bySource.length === 0 ? (
                  <EmptyRow cols={6} />
                ) : (
                  report.bySource.map((row, index) => (
                    <TableRow key={row.source}>
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-2">
                          <span className={`size-2.5 rounded-full ${sourceSwatch(index)}`} />
                          {row.source}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.incoming}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.qualified}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.won}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.avgWon)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.wonValue)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Panel>
        </TabsContent>

        {showTeam ? (
          <TabsContent value="team" className="mt-5 space-y-5">
            <MetricStrip className="sm:grid-cols-2 xl:grid-cols-4">
              <Highlight
                title={report.highlights.topCloser?.staff.name ?? "—"}
                label="Top closer"
                value={report.highlights.topCloser ? formatShare(report.highlights.topCloser.closeRate) : "—"}
              />
              <Highlight
                title={report.highlights.biggestJob?.owner ?? "—"}
                label="Biggest job"
                value={report.highlights.biggestJob ? compact(report.highlights.biggestJob.value) : "—"}
              />
              <Highlight
                title={report.highlights.mostAssigned?.staff.name ?? "—"}
                label="Most assigned jobs"
                value={report.highlights.mostAssigned ? String(report.highlights.mostAssigned.assigned) : "—"}
              />
              <Highlight
                title={report.highlights.mostQualified?.staff.name ?? "—"}
                label="Most qualified leads"
                value={report.highlights.mostQualified ? String(report.highlights.mostQualified.qualified) : "—"}
              />
            </MetricStrip>
            <Panel title="Team leaderboard" description="Only people in the book this seat is allowed to see.">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Job owner</TableHead>
                    <TableHead className="text-right">Value of won jobs</TableHead>
                    <TableHead className="text-right">Jobs</TableHead>
                    <TableHead className="text-right">Close rate</TableHead>
                    <TableHead className="text-right">Qualified close</TableHead>
                    <TableHead className="text-right">Avg. job size</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.byTeam.length === 0 ? (
                    <EmptyRow cols={7} />
                  ) : (
                    report.byTeam.map((row, index) => (
                      <TableRow key={row.staff.id}>
                        <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                        <TableCell>
                          <p className="font-medium">{row.staff.name}</p>
                          <p className="text-xs text-muted-foreground">{SEAT_ROLE_LABELS[row.staff.role]}</p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{money(row.wonValue)}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.won}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatShare(row.closeRate)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatShare(row.qualifiedClose)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(row.avgJob)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Panel>
          </TabsContent>
        ) : null}

        <TabsContent value="lost" className="mt-5 space-y-5">
          <MetricStrip className="sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Highest job value lost" value={compact(report.kpis.highestLost)} hint="Largest lost lead" />
            <Metric label="Top reason" value={clip(report.kpis.topLostReason, 28)} hint="Most frequent lost reason" />
            <Metric label="Days to loss" value={report.kpis.daysToLoss.toFixed(0)} hint="Avg. time from created to lost" />
            <Metric label="Job lost average" value={compact(report.kpis.lostAvg)} hint="Avg. value of lost jobs" />
            <Metric label="Total lost opportunity" value={compact(report.kpis.lostTotal)} hint="Combined value of lost jobs" />
          </MetricStrip>
          <Panel title="Job lost reasoning" description="Why work left the book in this range.">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job lost reason</TableHead>
                  <TableHead className="text-right">Jobs lost</TableHead>
                  <TableHead>Share of lost jobs</TableHead>
                  <TableHead className="text-right">Lost value</TableHead>
                  <TableHead>Share of lost value</TableHead>
                  <TableHead className="text-right">Avg. lost value</TableHead>
                  <TableHead className="text-right">Avg. days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.lostReasons.length === 0 ? (
                  <EmptyRow cols={7} />
                ) : (
                  report.lostReasons.map((row) => (
                    <TableRow key={row.reason}>
                      <TableCell className="font-medium">{row.reason}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                      <TableCell>
                        <PctBar value={row.pctCount} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.value)}</TableCell>
                      <TableCell>
                        <PctBar value={row.pctValue} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.avgValue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.avgDays.toFixed(0)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Panel>
          <Panel title="Lost jobs" description="Individual leads marked lost in this range.">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Lead source</TableHead>
                  <TableHead>Job owner</TableHead>
                  <TableHead className="text-right">Job value</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.lostJobs.length === 0 ? (
                  <EmptyRow cols={7} />
                ) : (
                  report.lostJobs.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link href={`/opportunities/${row.id}`} className="font-medium hover:underline">
                          {row.name}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[14rem] truncate text-muted-foreground">{row.location}</TableCell>
                      <TableCell>{row.source}</TableCell>
                      <TableCell>{row.owner}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.value)}</TableCell>
                      <TableCell className="max-w-[16rem] truncate">{row.reason}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(row.createdAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Panel>
        </TabsContent>

        <TabsContent value="overview" className="mt-5 space-y-5">
          <Panel title="Job metrics" description="Value of work sold in this range.">
            <VerticalBars
              items={report.monthlyWon.map((row) => ({ label: row.label, value: row.value }))}
              format={compact}
            />
            <div className="grid gap-px border-t bg-border sm:grid-cols-3 xl:grid-cols-6">
              <Metric label="Value of won jobs" value={compact(report.kpis.wonValue)} />
              <Metric label="Average job size" value={compact(report.kpis.avgJob)} />
              <Metric label="Jobs won" value={String(report.kpis.wonCount)} />
              <Metric label="Value of lost jobs" value={compact(report.kpis.lostTotal)} />
              <Metric label="Jobs lost" value={String(report.kpis.lostCount)} />
              <Metric label="Days to complete" value={report.kpis.daysToComplete.toFixed(1)} hint="Start to substantial completion" />
            </div>
          </Panel>
          {showTeam ? (
            <Panel title="Team leaderboard" description="Won work for people in your scope.">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Value of won jobs</TableHead>
                    <TableHead className="text-right">Jobs won</TableHead>
                    <TableHead className="text-right">Close rate</TableHead>
                    <TableHead className="text-right">Avg. job size</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.byTeam.slice(0, 8).map((row) => (
                    <TableRow key={row.staff.id}>
                      <TableCell className="font-medium">{row.staff.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.wonValue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.won}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatShare(row.closeRate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.avgJob)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          ) : null}
        </TabsContent>

        <TabsContent value="workflow" className="mt-5 space-y-5">
          <Panel title="Workflow at a glance">
            <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-5">
              <Metric label="New leads" value={String(report.kpis.incoming)} />
              <Metric label="Days to sold" value={report.kpis.daysToSold.toFixed(1)} hint="Created to job start" />
              <Metric label="New lead to qualified" value={formatShare(report.kpis.newToQualified)} />
              <Metric label="Qualified close rate" value={formatShare(report.kpis.qualifiedClose)} />
              <Metric label="Close rate" value={formatShare(report.kpis.closeRate)} />
            </div>
          </Panel>
          <Panel title="Lead performance" description="Sources feeding this workflow.">
            <div className="mb-4">
              <StackedShare items={report.bySource.map((row) => ({ label: row.source, value: row.incoming }))} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead source</TableHead>
                  <TableHead className="text-right">New leads</TableHead>
                  <TableHead className="text-right">Qualified</TableHead>
                  <TableHead className="text-right">Jobs won</TableHead>
                  <TableHead className="text-right">New to qualified</TableHead>
                  <TableHead className="text-right">Qualified close</TableHead>
                  <TableHead className="text-right">Value of won jobs</TableHead>
                  <TableHead className="text-right">Average job size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.bySource.length === 0 ? (
                  <EmptyRow cols={8} />
                ) : (
                  report.bySource.map((row, index) => (
                    <TableRow key={row.source}>
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-2">
                          <span className={`size-2.5 rounded-full ${sourceSwatch(index)}`} />
                          {row.source}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.incoming}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.qualified}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.won}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatShare(row.newToQualified)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatShare(row.qualifiedClose)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.wonValue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(row.avgWon)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Panel>
        </TabsContent>

        <TabsContent value="pipeline" className="mt-5 space-y-5">
          <Panel
            title="Pipeline quantity and value"
            description="Live funnel for the book this seat can see — not limited to the date range."
            action={
              <div className="flex gap-1">
                <Button type="button" size="sm" variant={pipelineMode === "funnel" ? "default" : "outline"} onClick={() => setPipelineMode("funnel")}>
                  Funnel chart
                </Button>
                <Button type="button" size="sm" variant={pipelineMode === "bars" ? "default" : "outline"} onClick={() => setPipelineMode("bars")}>
                  Bar chart
                </Button>
              </div>
            }
          >
            <div className="grid grid-cols-[9rem_1fr_1fr] gap-3 px-1 pb-2 text-[11px] tracking-wide text-muted-foreground uppercase">
              <span>Stage</span>
              <span className="text-right">Quantity</span>
              <span>Value</span>
            </div>
            <PipelineBars rows={report.pipeline} mode={pipelineMode} formatMoney={money} />
          </Panel>
        </TabsContent>
      </Tabs>
      )}
    </div>
  );
}

function ChartCard({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">{children}</CardContent>
    </Card>
  );
}

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

function ProjectTypeTable({ rows, money }: { rows: WorkflowRow[]; money: (value: number) => string }) {
  const grand = rows.reduce(
    (sum, row) => ({
      won: sum.won + row.won,
      lost: sum.lost + row.lost,
      pending: sum.pending + row.pending,
      total: sum.total + row.total,
      wonValue: sum.wonValue + row.wonValue,
      lostValue: sum.lostValue + row.lostValue,
      pendingValue: sum.pendingValue + row.pendingValue,
      totalValue: sum.totalValue + row.totalValue,
    }),
    { won: 0, lost: 0, pending: 0, total: 0, wonValue: 0, lostValue: 0, pendingValue: 0, totalValue: 0 }
  );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project type</TableHead>
          <TableHead className="text-right">Win rate</TableHead>
          <TableHead className="text-right">Jobs won</TableHead>
          <TableHead className="text-right">Jobs lost</TableHead>
          <TableHead className="text-right">Jobs pending</TableHead>
          <TableHead className="text-right">Jobs total</TableHead>
          <TableHead className="text-right">Won value</TableHead>
          <TableHead className="text-right">Lost value</TableHead>
          <TableHead className="text-right">Pending value</TableHead>
          <TableHead className="text-right">Total value</TableHead>
          <TableHead className="text-right">% of total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? <EmptyRow cols={11} /> : null}
        {rows.map((row) => (
          <TableRow key={row.label}>
            <TableCell className="font-medium">{row.label}</TableCell>
            <TableCell className="text-right tabular-nums">{formatShare(row.winRate)}</TableCell>
            <TableCell className="text-right tabular-nums">{row.won}</TableCell>
            <TableCell className="text-right tabular-nums">{row.lost}</TableCell>
            <TableCell className="text-right tabular-nums">{row.pending}</TableCell>
            <TableCell className="text-right tabular-nums">{row.total}</TableCell>
            <TableCell className="text-right tabular-nums">{money(row.wonValue)}</TableCell>
            <TableCell className="text-right tabular-nums">{money(row.lostValue)}</TableCell>
            <TableCell className="text-right tabular-nums">{money(row.pendingValue)}</TableCell>
            <TableCell className="text-right tabular-nums">{money(row.totalValue)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatShare(row.share)}</TableCell>
          </TableRow>
        ))}
        {rows.length ? (
          <TableRow className="font-medium">
            <TableCell>Grand total</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatShare(grand.won + grand.lost ? grand.won / (grand.won + grand.lost) : 0)}
            </TableCell>
            <TableCell className="text-right tabular-nums">{grand.won}</TableCell>
            <TableCell className="text-right tabular-nums">{grand.lost}</TableCell>
            <TableCell className="text-right tabular-nums">{grand.pending}</TableCell>
            <TableCell className="text-right tabular-nums">{grand.total}</TableCell>
            <TableCell className="text-right tabular-nums">{money(grand.wonValue)}</TableCell>
            <TableCell className="text-right tabular-nums">{money(grand.lostValue)}</TableCell>
            <TableCell className="text-right tabular-nums">{money(grand.pendingValue)}</TableCell>
            <TableCell className="text-right tabular-nums">{money(grand.totalValue)}</TableCell>
            <TableCell className="text-right tabular-nums">100.0%</TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}

function Highlight({ title, label, value }: { title: string; label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-4">
      <p className="font-medium">{title}</p>
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="font-heading mt-2 text-[1.7rem] leading-none font-medium tabular-nums">{value}</p>
    </div>
  );
}

function PctBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <ShareBar value={value} className="bg-rose-500/80" />
      <span className="w-12 text-right text-xs tabular-nums">{formatShare(value)}</span>
    </div>
  );
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="text-muted-foreground">
        Nothing in this date range.
      </TableCell>
    </TableRow>
  );
}

function runningTotal(rows: { label: string; value: number }[]) {
  let total = 0;
  return rows.map((row) => {
    total += row.value;
    return { label: row.label, value: total };
  });
}

function clip(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const body = [headers, ...rows]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
