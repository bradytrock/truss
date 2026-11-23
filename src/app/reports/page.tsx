"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState, type ReactNode } from "react";
import { ArrowUpDown, CalendarDays, ChevronDown, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BAR_PALETTES,
  BarCell,
  PipelineBars,
  REPORT_COLORS,
  ShareBar,
  StackedShare,
  Swatch,
  VerticalBars,
  sourceColor,
  type BarPalette,
} from "@/components/reports-charts";
import {
  EmptyRow,
  Num,
  PersonAvatar,
  PersonCell,
  Pill,
  RankBadge,
  ReportCard,
  ReportPanel,
  Segmented,
  StatCard,
  StatGrid,
  TotalRow,
  type StatTone,
} from "@/components/reports-chrome";
import { EmptyState, ErrorBanner, LoadingScreen } from "@/components/page-chrome";
import { BdRoiPanel, bdRoiCsvHeaders, bdRoiCsvRows } from "@/components/bd-roi";
import { CardAnalyticsReport } from "@/components/card-analytics-report";
import { jobsBoardColumnHref } from "@/components/jobs-board";
import { useCrm } from "@/lib/crm-store";
import { buildBdRoi, isBusinessDevelopment } from "@/lib/bd";
import { formatCurrency, formatCurrencyFull, formatDate } from "@/lib/format";
import type { CardPersonRow, CardRange } from "@/lib/card-analytics";
import { PIPELINE_PATH_COLUMNS } from "@/lib/pipeline-path";
import {
  DATE_PRESETS,
  REPORT_SCOPE_LABELS,
  REPORT_TABS,
  buildPerformance,
  filterLostJobs,
  formatShare,
  rangeLabel,
  sortTeamRows,
  type DatePreset,
  type MonthlyRow,
  type PerformanceReport,
  type ReportTab,
  type TeamRow,
  type TeamSortKey,
  type WorkflowRow,
} from "@/lib/reports";
import { SEAT_ROLE_LABELS, type SeatRole } from "@/lib/types";
import {
  accessScope,
  canSeeTeamPerformance,
  canViewProjectFinancials,
  canViewReports,
  reportScopeOptions,
  scopeBook,
  type AccessScope,
} from "@/lib/visibility";
import { cn } from "@/lib/utils";
import type { WorkColumn } from "@/lib/work-board";

const LOST_PAGE_SIZE = 8;

function isReportTab(value: string | null): value is ReportTab {
  return Boolean(value && REPORT_TABS.some((item) => item.id === value));
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ReportsPageInner />
    </Suspense>
  );
}

function ReportsPageInner() {
  const crm = useCrm();
  const viewer = crm.effectiveStaff;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [preset, setPreset] = useState<DatePreset>("ytd");
  const [requestedTab, setRequestedTab] = useState<ReportTab | null>(() => {
    const value = searchParams.get("tab");
    return isReportTab(value) ? value : null;
  });
  const [viewScope, setViewScope] = useState<AccessScope | null>(null);
  const [cardRows, setCardRows] = useState<{ rows: CardPersonRow[]; range: CardRange } | null>(null);

  const scopeOptions = useMemo(() => (viewer ? reportScopeOptions(viewer) : []), [viewer]);
  const effectiveScope: AccessScope | undefined =
    viewScope && scopeOptions.includes(viewScope) ? viewScope : scopeOptions[scopeOptions.length - 1];

  const book = useMemo(() => scopeBook(crm.book, viewer, effectiveScope), [crm.book, viewer, effectiveScope]);

  const report = useMemo(() => {
    if (!viewer) return null;
    return buildPerformance(
      {
        staff: book.staff,
        jobs: book.jobs,
        opportunities: book.opportunities,
        contacts: book.contacts,
        estimates: book.estimates,
        estimateLines: book.estimateLines,
        payments: book.payments,
        expenses: book.expenses,
      },
      viewer,
      preset,
      new Date(),
      effectiveScope,
    );
  }, [book, viewer, preset, effectiveScope]);

  const onCardRows = useCallback((rows: CardPersonRow[], range: CardRange) => {
    setCardRows({ rows, range });
  }, []);

  if (!crm.hydrated) return <LoadingScreen />;

  if (!viewer || !canViewReports(viewer.role)) {
    return (
      <EmptyState
        title="Reports are restricted"
        description="Project managers and field seats work from their own jobs. Company admin, directors, business development, team leads, and accounting run reports — each only on the book their seat can see."
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
  const grantedScope = accessScope(viewer.role, viewer.restricted);
  const isBd = isBusinessDevelopment(viewer.role);
  const showTeam = canSeeTeamPerformance(viewer.role) && effectiveScope !== "own";
  const showBd = isBd || grantedScope === "company";
  const financials = canViewProjectFinancials(viewer.role);
  const tabs = REPORT_TABS.filter((item) => (!item.teamOnly || showTeam) && (!item.bdOnly || showBd));
  const defaultTab: ReportTab = isBd ? "bd" : "overview";
  const activeTab: ReportTab =
    requestedTab && tabs.some((item) => item.id === requestedTab) ? requestedTab : defaultTab;

  function selectTab(next: ReportTab) {
    setRequestedTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`/reports?${params.toString()}`, { scroll: false });
  }

  function exportCurrent() {
    const stamp = data.range.end;
    switch (activeTab) {
      case "leads":
      case "workflow":
        downloadCsv(
          `lead-performance-${stamp}.csv`,
          ["Lead source", "Incoming", "Qualified", "New to qualified", "Won", "Qualified close", "Avg won", "Total won"],
          data.bySource.map((row) => [
            row.source,
            row.incoming,
            row.qualified,
            formatShare(row.newToQualified),
            row.won,
            formatShare(row.qualifiedClose),
            row.avgWon,
            row.wonValue,
          ]),
        );
        return;
      case "team":
      case "overview":
        downloadCsv(
          `team-performance-${stamp}.csv`,
          ["Rank", "Owner", "Role", "Won value", "Jobs won", "Close rate", "Qualified close", "Avg job"],
          data.byTeam.map((row, index) => [
            index + 1,
            row.staff.name,
            SEAT_ROLE_LABELS[row.staff.role],
            row.wonValue,
            row.won,
            formatShare(row.closeRate),
            formatShare(row.qualifiedClose),
            row.avgJob,
          ]),
        );
        return;
      case "lost":
        downloadCsv(
          `lost-jobs-${stamp}.csv`,
          ["Job", "Address", "Source", "Owner", "Value", "Reason", "Created"],
          data.lostJobs.map((row) => [row.name, row.location, row.source, row.owner, row.value, row.reason, row.createdAt.slice(0, 10)]),
        );
        return;
      case "pipeline":
        downloadCsv(
          `pipeline-${stamp}.csv`,
          ["Column", "Jobs", "Board value"],
          data.pipeline.map((row) => [row.label, row.count, row.value]),
        );
        return;
      case "cards":
        downloadCsv(
          `card-activity-${stamp}.csv`,
          ["Person", "Opens", "Contact saves", "Save rate", "Review taps", "Calls", "Texts", "Total actions"],
          (cardRows?.rows ?? []).map((row) => [
            row.name,
            row.opens,
            row.saves,
            formatShare(row.saveRate),
            row.reviews,
            row.calls,
            row.texts,
            row.actions,
          ]),
        );
        return;
      case "bd": {
        const bd = buildBdRoi(crm.book);
        downloadCsv(`bd-roi-${stamp}.csv`, bdRoiCsvHeaders(financials), bdRoiCsvRows(bd, financials));
        return;
      }
      default:
        downloadCsv(
          `job-report-${stamp}.csv`,
          ["Type", "Win rate", "Won", "Lost", "Pending", "Total", "Won value", "Lost value", "Pending value", "Total value", "Share"],
          data.byProjectType.map((row) => [
            row.label,
            formatShare(row.winRate),
            row.won,
            row.lost,
            row.pending,
            row.total,
            row.wonValue,
            row.lostValue,
            row.pendingValue,
            row.totalValue,
            formatShare(row.share),
          ]),
        );
    }
  }

  const presetLabel = DATE_PRESETS.find((item) => item.id === preset)?.label ?? "Range";

  return (
    <div className="-m-5 flex min-h-[calc(100dvh-3.5rem)] flex-col sm:-m-7">
      <div className="border-b bg-white px-5 pt-4 sm:px-7" style={{ borderColor: REPORT_COLORS.border }}>
        {crm.hydrateError ? (
          <div className="mb-3">
            <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
          </div>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.14em] uppercase" style={{ color: REPORT_COLORS.muted }}>
              {crm.company.name || "Reports"}
            </p>
            <h1 className="mt-0.5 text-[1.5rem] leading-tight font-semibold tracking-tight" style={{ color: REPORT_COLORS.ink }}>
              Reports
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {scopeOptions.length > 1 && effectiveScope ? (
              <Segmented
                aria-label="Report scope"
                value={effectiveScope}
                onChange={setViewScope}
                options={scopeOptions.map((scope) => ({ value: scope, label: REPORT_SCOPE_LABELS[scope] }))}
              />
            ) : null}
            {activeTab === "pipeline" ? (
              <HeaderNote dot>Live board · date range does not apply</HeaderNote>
            ) : activeTab === "cards" ? (
              <HeaderNote>This report uses its own range below</HeaderNote>
            ) : activeTab === "bd" ? (
              <HeaderNote>Calendar year {report.year} · date range does not apply</HeaderNote>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 rounded-lg bg-white px-3 text-[13px] font-medium"
                      style={{ borderColor: REPORT_COLORS.border, color: REPORT_COLORS.ink }}
                    />
                  }
                >
                  <CalendarDays className="size-4" style={{ color: REPORT_COLORS.muted }} />
                  {presetLabel} · {rangeLabel(report.range)}
                  <ChevronDown className="size-4" style={{ color: REPORT_COLORS.muted }} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {DATE_PRESETS.map((item) => (
                    <DropdownMenuItem key={item.id} onClick={() => setPreset(item.id)}>
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              type="button"
              onClick={exportCurrent}
              className="h-9 rounded-lg bg-[#111827] px-3.5 text-[13px] font-medium text-white hover:bg-[#1f2937]"
            >
              <Download className="size-4" />
              Export
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => selectTab(value as ReportTab)} className="mt-4">
          <TabsList
            variant="line"
            className="h-auto w-full justify-start gap-5 overflow-x-auto rounded-none bg-transparent p-0"
          >
            {tabs.map((item) => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                className="h-auto flex-none rounded-none border-0 px-0.5 pt-1 pb-3 text-[13px] font-medium text-[#5b6472] hover:text-[#111827] data-active:text-[#1e4fd8] after:h-[2px] after:bg-[#1e4fd8] group-data-horizontal/tabs:after:bottom-0"
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 space-y-4 bg-[#f5f6f8] px-5 py-5 sm:px-7">
        {activeTab === "overview" ? (
          <OverviewTab report={report} financials={financials} showTeam={showTeam} onViewTeam={() => selectTab("team")} />
        ) : null}
        {activeTab === "jobs" ? <JobsTab report={report} financials={financials} /> : null}
        {activeTab === "leads" ? <LeadsTab report={report} /> : null}
        {activeTab === "workflow" ? <WorkflowTab report={report} /> : null}
        {activeTab === "pipeline" ? <PipelineTab report={report} /> : null}
        {activeTab === "team" && showTeam ? <TeamTab report={report} /> : null}
        {activeTab === "lost" ? <LostTab report={report} /> : null}
        {activeTab === "cards" ? <CardAnalyticsReport onRows={onCardRows} /> : null}
        {activeTab === "bd" && showBd ? <BdRoiPanel state={crm.book} viewer={viewer} /> : null}
      </div>
    </div>
  );
}

function HeaderNote({ children, dot }: { children: ReactNode; dot?: boolean }) {
  return (
    <span
      className="inline-flex h-9 items-center gap-2 rounded-lg border bg-white px-3 text-[13px]"
      style={{ borderColor: REPORT_COLORS.border, color: REPORT_COLORS.muted }}
    >
      {dot ? <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: REPORT_COLORS.teal }} /> : null}
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * Overview
 * -------------------------------------------------------------------------- */

function OverviewTab({
  report,
  financials,
  showTeam,
  onViewTeam,
}: {
  report: PerformanceReport;
  financials: boolean;
  showTeam: boolean;
  onViewTeam: () => void;
}) {
  const compact = (value: number) => formatCurrency(value);
  return (
    <>
      <div className={cn("grid gap-4", financials && "xl:grid-cols-2")}>
        <ChartPanel
          title="Contracts signed (value)"
          total={compact(report.kpis.totalValue)}
          rows={report.monthlyWon}
          pick="value"
          format={compact}
          palette={BAR_PALETTES.blue}
          currentKey={report.currentMonthKey}
        />
        {financials ? (
          <ChartPanel
            title="Cash collected"
            total={compact(report.monthlyCash.reduce((sum, row) => sum + row.value, 0))}
            rows={report.monthlyCash}
            pick="value"
            format={compact}
            palette={BAR_PALETTES.teal}
            currentKey={report.currentMonthKey}
          />
        ) : null}
      </div>

      <ReportCard className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0 xl:grid-cols-6" >
        <InlineMetric label="Won value" value={compact(report.kpis.wonValue)} />
        <InlineMetric label="Avg job size" value={formatCurrencyFull(report.kpis.avgJob)} />
        <InlineMetric label="Jobs won" value={String(report.kpis.wonCount)} />
        <InlineMetric label="Lost value" value={compact(report.kpis.lostTotal)} tone="orange" />
        <InlineMetric label="Jobs lost" value={String(report.kpis.lostCount)} tone="orange" />
        <InlineMetric label="Days to complete" value={report.kpis.daysToComplete.toFixed(0)} />
      </ReportCard>

      {showTeam ? (
        <ReportPanel
          title="Team leaderboard · top 8"
          action={
            <button
              type="button"
              onClick={onViewTeam}
              className="text-[13px] font-medium hover:underline"
              style={{ color: REPORT_COLORS.blue }}
            >
              View full team →
            </button>
          }
          bodyClassName="px-0 pb-0"
        >
          <LeaderboardTable rows={report.byTeam.slice(0, 8)} rankStyle="plain" />
        </ReportPanel>
      ) : null}
    </>
  );
}

function InlineMetric({ label, value, tone = "default" }: { label: string; value: string; tone?: StatTone }) {
  return (
    <div className="px-4 py-3.5">
      <p className="text-[13px]" style={{ color: REPORT_COLORS.muted }}>
        {label}
      </p>
      <p
        className="mt-1.5 text-[1.5rem] leading-none font-semibold tracking-tight tabular-nums"
        style={{ color: tone === "orange" ? REPORT_COLORS.orange : tone === "blue" ? REPORT_COLORS.blue : REPORT_COLORS.ink }}
      >
        {value}
      </p>
    </div>
  );
}

function ChartPanel({
  title,
  total,
  rows,
  pick,
  format,
  palette,
  currentKey,
}: {
  title: string;
  total: string;
  rows: MonthlyRow[];
  pick: "count" | "value";
  format: (value: number) => string;
  palette: BarPalette;
  currentKey: string;
}) {
  return (
    <ReportCard className="px-4 pt-4 pb-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-semibold" style={{ color: REPORT_COLORS.ink }}>
          {title}
        </h2>
        <p className="text-[1.35rem] leading-none font-semibold tracking-tight tabular-nums" style={{ color: REPORT_COLORS.ink }}>
          {total}
        </p>
      </div>
      <VerticalBars
        className="mt-4"
        items={rows.map((row) => ({ key: row.key, label: row.label, value: row[pick] }))}
        format={format}
        palette={palette}
        highlightKey={currentKey}
      />
      <p className="mt-3 text-[11px]" style={{ color: REPORT_COLORS.muted }}>
        Lighter bar = current month to date. Hover a bar for exact value.
      </p>
    </ReportCard>
  );
}

/* ----------------------------------------------------------------------------
 * Jobs
 * -------------------------------------------------------------------------- */

function JobsTab({ report, financials }: { report: PerformanceReport; financials: boolean }) {
  const [mode, setMode] = useState<"counts" | "values">("counts");
  const compact = (value: number) => formatCurrency(value);
  return (
    <>
      <StatGrid className="xl:grid-cols-5">
        <StatCard label="Total jobs" value={String(report.kpis.totalJobs)} hint="Contracts signed in range" />
        <StatCard label="Total signed value" value={compact(report.kpis.totalValue)} tone="blue" hint="Sum of signed contracts" />
        <StatCard label="Average job value" value={formatCurrencyFull(report.kpis.avgJob)} hint="Signed value ÷ jobs" />
        <StatCard label="Jobs lost" value={String(report.kpis.lostCount)} tone="orange" hint="Marked lost in range" />
        <StatCard label="Lost average" value={formatCurrencyFull(report.kpis.lostAvg)} tone="orange" hint="Avg value of lost jobs" />
      </StatGrid>

      <div className={cn("grid gap-4", financials ? "xl:grid-cols-3" : "xl:grid-cols-2")}>
        <ChartPanel
          title="Jobs opened"
          total={report.monthlyOpened.reduce((sum, row) => sum + row.count, 0).toLocaleString("en-US")}
          rows={report.monthlyOpened}
          pick="count"
          format={(value) => String(Math.round(value))}
          palette={BAR_PALETTES.slate}
          currentKey={report.currentMonthKey}
        />
        <ChartPanel
          title="Contracts signed"
          total={report.kpis.totalJobs.toLocaleString("en-US")}
          rows={report.monthlyWon}
          pick="count"
          format={(value) => String(Math.round(value))}
          palette={BAR_PALETTES.blue}
          currentKey={report.currentMonthKey}
        />
        {financials ? (
          <ChartPanel
            title="Cash collected"
            total={compact(report.monthlyCash.reduce((sum, row) => sum + row.value, 0))}
            rows={report.monthlyCash}
            pick="value"
            format={compact}
            palette={BAR_PALETTES.teal}
            currentKey={report.currentMonthKey}
          />
        ) : null}
      </div>

      <ReportPanel
        title="Metrics by project type"
        description="Win rate = won ÷ (won + lost). % of total = share of total value."
        action={
          <Segmented
            aria-label="Project type metric"
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: "counts", label: "Counts" },
              { value: "values", label: "Values" },
            ]}
          />
        }
        bodyClassName="px-0 pb-0"
      >
        <ProjectTypeTable rows={report.byProjectType} mode={mode} />
      </ReportPanel>
    </>
  );
}

function ProjectTypeTable({ rows, mode }: { rows: WorkflowRow[]; mode: "counts" | "values" }) {
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
    { won: 0, lost: 0, pending: 0, total: 0, wonValue: 0, lostValue: 0, pendingValue: 0, totalValue: 0 },
  );
  const values = mode === "values";
  const cell = (count: number, value: number) => (values ? formatCurrencyFull(value) : String(count));
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-4">Project type</TableHead>
          <TableHead>Win rate</TableHead>
          <TableHead className="text-right">{values ? "Won value" : "Won"}</TableHead>
          <TableHead className="text-right">{values ? "Lost value" : "Lost"}</TableHead>
          <TableHead className="text-right">{values ? "Pending value" : "Pending"}</TableHead>
          <TableHead className="text-right">{values ? "Total value" : "Total"}</TableHead>
          <TableHead className="pr-4 text-right">% of total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? <EmptyRow cols={7} /> : null}
        {rows.map((row) => (
          <TableRow key={row.label}>
            <TableCell className="pl-4 font-semibold">{row.label}</TableCell>
            <TableCell>
              <BarCell value={row.winRate} label={formatShare(row.winRate)} color={REPORT_COLORS.blue} track="#f3e4dc" labelClassName="font-semibold" />
            </TableCell>
            <TableCell className="text-right">
              <Num tone="blue" bold>
                {cell(row.won, row.wonValue)}
              </Num>
            </TableCell>
            <TableCell className="text-right">
              <Num tone="orange">{cell(row.lost, row.lostValue)}</Num>
            </TableCell>
            <TableCell className="text-right tabular-nums">{cell(row.pending, row.pendingValue)}</TableCell>
            <TableCell className="text-right tabular-nums">{cell(row.total, row.totalValue)}</TableCell>
            <TableCell className="pr-4 text-right font-semibold tabular-nums">{formatShare(row.share)}</TableCell>
          </TableRow>
        ))}
        {rows.length ? (
          <TotalRow>
            <TableCell className="pl-4">Grand total</TableCell>
            <TableCell className="tabular-nums">
              {formatShare(grand.won + grand.lost ? grand.won / (grand.won + grand.lost) : 0)}
            </TableCell>
            <TableCell className="text-right tabular-nums">{cell(grand.won, grand.wonValue)}</TableCell>
            <TableCell className="text-right tabular-nums">{cell(grand.lost, grand.lostValue)}</TableCell>
            <TableCell className="text-right tabular-nums">{cell(grand.pending, grand.pendingValue)}</TableCell>
            <TableCell className="text-right tabular-nums">{cell(grand.total, grand.totalValue)}</TableCell>
            <TableCell className="pr-4 text-right tabular-nums">100%</TableCell>
          </TotalRow>
        ) : null}
      </TableBody>
    </Table>
  );
}

/* ----------------------------------------------------------------------------
 * Lead performance
 * -------------------------------------------------------------------------- */

function LeadsTab({ report }: { report: PerformanceReport }) {
  const [metric, setMetric] = useState<"incoming" | "won" | "wonValue">("incoming");
  const { kpis } = report;
  const sourceWon = report.bySource.reduce((sum, row) => sum + row.won, 0);
  const sourceWonValue = report.bySource.reduce((sum, row) => sum + row.wonValue, 0);
  const captions = {
    incoming: "Share of incoming leads",
    won: "Share of won jobs",
    wonValue: "Share of won value",
  } as const;
  return (
    <>
      <StatGrid className="xl:grid-cols-6">
        <StatCard label="Incoming leads" value={String(kpis.incoming)} hint="Created in range" />
        <StatCard
          label="Unqualified"
          value={String(kpis.unqualified)}
          tone="orange"
          hint={kpis.incoming ? `${formatShare(kpis.unqualified / kpis.incoming)} of incoming` : "Kept out of close rate"}
        />
        <StatCard label="Avg days to sold" value={kpis.daysToSold.toFixed(0)} hint="Lead created → contract" />
        <StatCard
          label="New lead → qualified"
          value={formatShare(kpis.newToQualified)}
          hint={`${kpis.qualified} of ${kpis.incoming} qualified`}
        />
        <StatCard
          label="Qualified close rate"
          value={formatShare(kpis.qualifiedClose)}
          tone="blue"
          hint={`${kpis.wonLeads} won of ${kpis.qualified} qualified`}
        />
        <StatCard label="Overall close rate" value={formatShare(kpis.closeRate)} hint="Won ÷ (won + lost) · unqualified excluded" />
      </StatGrid>

      <ReportPanel
        title="By lead source"
        action={
          <Segmented
            aria-label="Lead source share"
            size="sm"
            value={metric}
            onChange={setMetric}
            options={[
              { value: "incoming", label: "Incoming" },
              { value: "won", label: "Won" },
              { value: "wonValue", label: "Won value" },
            ]}
          />
        }
        bodyClassName="px-0 pb-0"
      >
        <div className="px-4 pb-4">
          <StackedShare
            caption={captions[metric]}
            items={report.bySource.map((row) => ({ label: row.source, value: row[metric] }))}
            format={metric === "wonValue" ? formatCurrencyFull : (value) => String(value)}
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Lead source</TableHead>
              <TableHead className="text-right">Incoming</TableHead>
              <TableHead className="text-right">Qualified</TableHead>
              <TableHead className="text-right">Won</TableHead>
              <TableHead className="text-right">Avg won value</TableHead>
              <TableHead className="pr-4 text-right">Total won value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.bySource.length === 0 ? <EmptyRow cols={6} /> : null}
            {report.bySource.map((row, index) => (
              <TableRow key={row.source}>
                <TableCell className="pl-4 font-semibold">
                  <span className="inline-flex items-center gap-2">
                    <Swatch color={sourceColor(index)} />
                    {row.source}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.incoming}</TableCell>
                <TableCell className="text-right tabular-nums">{row.qualified}</TableCell>
                <TableCell className="text-right">
                  <Num tone="blue" bold>
                    {row.won}
                  </Num>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrencyFull(row.avgWon)}</TableCell>
                <TableCell className="pr-4 text-right font-semibold tabular-nums">{formatCurrencyFull(row.wonValue)}</TableCell>
              </TableRow>
            ))}
            {report.bySource.length ? (
              <TotalRow>
                <TableCell className="pl-4">Total</TableCell>
                <TableCell className="text-right tabular-nums">{kpis.incoming}</TableCell>
                <TableCell className="text-right tabular-nums">{kpis.qualified}</TableCell>
                <TableCell className="text-right tabular-nums">{sourceWon}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrencyFull(avgOf(sourceWonValue, sourceWon))}</TableCell>
                <TableCell className="pr-4 text-right tabular-nums">{formatCurrencyFull(sourceWonValue)}</TableCell>
              </TotalRow>
            ) : null}
          </TableBody>
        </Table>
      </ReportPanel>
    </>
  );
}

function avgOf(total: number, count: number) {
  return count ? total / count : 0;
}

/* ----------------------------------------------------------------------------
 * Workflow
 * -------------------------------------------------------------------------- */

function WorkflowTab({ report }: { report: PerformanceReport }) {
  const { kpis } = report;
  const wonTotal = report.bySource.reduce((sum, row) => sum + row.won, 0);
  const wonValue = report.bySource.reduce((sum, row) => sum + row.wonValue, 0);
  return (
    <>
      <ReportCard className="p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
          <StepCard label="Incoming leads" value={String(kpis.incoming)} hint={`${kpis.unqualified} unqualified`} />
          <StepArrow />
          <StepCard label="Qualified" value={String(kpis.qualified)} hint={`${formatShare(kpis.newToQualified)} of incoming`} />
          <StepArrow />
          <StepCard
            label="Won"
            value={String(kpis.wonLeads)}
            hint={`${formatShare(kpis.qualifiedClose)} qualified close`}
            tone="blue"
            highlight
          />
          <StepArrow />
          <StepCard label="Overall close" value={formatShare(kpis.closeRate)} hint="Won ÷ (won + lost)" />
          <div className="hidden w-2 lg:block" />
          <StepCard label="Avg days to sold" value={kpis.daysToSold.toFixed(0)} hint="Lead created → contract" />
        </div>
      </ReportCard>

      <ReportPanel
        title="Conversion by lead source"
        description="New → qualified = qualified ÷ incoming. Qualified close = won ÷ qualified."
        bodyClassName="px-0 pb-0"
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Lead source</TableHead>
              <TableHead className="text-right">Incoming</TableHead>
              <TableHead>New → qualified</TableHead>
              <TableHead className="text-right">Qualified</TableHead>
              <TableHead>Qualified close</TableHead>
              <TableHead className="text-right">Won</TableHead>
              <TableHead className="text-right">Won value</TableHead>
              <TableHead className="pr-4 text-right">Avg job size</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.bySource.length === 0 ? <EmptyRow cols={8} /> : null}
            {report.bySource.map((row) => (
              <TableRow key={row.source}>
                <TableCell className="pl-4 font-semibold">{row.source}</TableCell>
                <TableCell className="text-right tabular-nums">{row.incoming}</TableCell>
                <TableCell>
                  <BarCell value={row.newToQualified} label={formatShare(row.newToQualified)} color={REPORT_COLORS.slate} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.qualified}</TableCell>
                <TableCell>
                  <BarCell value={row.qualifiedClose} label={formatShare(row.qualifiedClose)} color={REPORT_COLORS.blue} />
                </TableCell>
                <TableCell className="text-right">
                  <Num tone="blue" bold>
                    {row.won}
                  </Num>
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(row.wonValue)}</TableCell>
                <TableCell className="pr-4 text-right tabular-nums">{formatCurrencyFull(row.avgWon)}</TableCell>
              </TableRow>
            ))}
            {report.bySource.length ? (
              <TotalRow>
                <TableCell className="pl-4">All sources</TableCell>
                <TableCell className="text-right tabular-nums">{kpis.incoming}</TableCell>
                <TableCell className="text-right tabular-nums">{formatShare(kpis.newToQualified)}</TableCell>
                <TableCell className="text-right tabular-nums">{kpis.qualified}</TableCell>
                <TableCell className="text-right tabular-nums">{formatShare(kpis.qualifiedClose)}</TableCell>
                <TableCell className="text-right tabular-nums">{wonTotal}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(wonValue)}</TableCell>
                <TableCell className="pr-4 text-right tabular-nums">{formatCurrencyFull(avgOf(wonValue, wonTotal))}</TableCell>
              </TotalRow>
            ) : null}
          </TableBody>
        </Table>
      </ReportPanel>
    </>
  );
}

function StepCard({
  label,
  value,
  hint,
  tone = "default",
  highlight,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: StatTone;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn("flex-1 rounded-lg border px-4 py-3.5", highlight ? "border-[#c9d6f6] bg-[#e8eefc]" : "bg-[#f5f6f8]")}
      style={highlight ? undefined : { borderColor: REPORT_COLORS.tint }}
    >
      <p className="text-[13px]" style={{ color: REPORT_COLORS.muted }}>
        {label}
      </p>
      <p
        className="mt-1.5 text-[1.6rem] leading-none font-semibold tracking-tight tabular-nums"
        style={{ color: tone === "blue" ? REPORT_COLORS.blue : REPORT_COLORS.ink }}
      >
        {value}
      </p>
      <p className="mt-2 text-xs" style={{ color: REPORT_COLORS.muted }}>
        {hint}
      </p>
    </div>
  );
}

function StepArrow() {
  return (
    <div className="flex items-center justify-center lg:w-4">
      <ChevronRight className="size-4 rotate-90 lg:rotate-0" style={{ color: "#aeb4bd" }} />
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Pipeline
 * -------------------------------------------------------------------------- */

const OPEN_COLUMNS = new Set<string>(PIPELINE_PATH_COLUMNS);

function PipelineTab({ report }: { report: PerformanceReport }) {
  const [mode, setMode] = useState<"funnel" | "bars">("funnel");
  const [metric, setMetric] = useState<"count" | "value">("count");
  const open = report.pipeline.filter((row) => OPEN_COLUMNS.has(row.id));
  const rest = report.pipeline.filter((row) => !OPEN_COLUMNS.has(row.id));
  const openJobs = open.reduce((sum, row) => sum + row.count, 0);
  const openValue = open.reduce((sum, row) => sum + row.value, 0);
  return (
    <ReportPanel
      title="Jobs board · by work column"
      description={
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span>
            <span className="text-[1.5rem] leading-none font-semibold tabular-nums" style={{ color: REPORT_COLORS.ink }}>
              {openJobs}
            </span>{" "}
            open jobs
          </span>
          <span>
            <span className="text-[1.5rem] leading-none font-semibold tabular-nums" style={{ color: REPORT_COLORS.blue }}>
              {formatCurrency(openValue)}
            </span>{" "}
            board value
          </span>
          <span>Updated live · not date-filtered</span>
        </span>
      }
      action={
        <>
          <Segmented
            aria-label="Pipeline shape"
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: "funnel", label: "Funnel" },
              { value: "bars", label: "Bars" },
            ]}
          />
          <Segmented
            aria-label="Pipeline measure"
            size="sm"
            value={metric}
            onChange={setMetric}
            options={[
              { value: "count", label: "Job count" },
              { value: "value", label: "Board value" },
            ]}
          />
        </>
      }
      footer={
        <span className="flex flex-wrap justify-between gap-x-4 gap-y-1">
          <span>Click a row to open that column on the Jobs board. Bar color steps from early (gray) to late stage (blue).</span>
          {rest.length ? (
            <span>
              Not on the funnel: {rest.map((row) => `${row.count} ${row.label.toLowerCase()}`).join(" · ")}
            </span>
          ) : null}
        </span>
      }
    >
      <PipelineBars
        rows={open}
        mode={mode}
        metric={metric}
        formatMoney={formatCurrency}
        hrefFor={(id) => jobsBoardColumnHref(id as WorkColumn)}
      />
    </ReportPanel>
  );
}

/* ----------------------------------------------------------------------------
 * Team
 * -------------------------------------------------------------------------- */

function TeamTab({ report }: { report: PerformanceReport }) {
  const [role, setRole] = useState<string>("all");
  const [sortKey, setSortKey] = useState<TeamSortKey>("wonValue");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const roles = useMemo(() => {
    const present = new Set(report.byTeam.map((row) => row.staff.role));
    return (Object.keys(SEAT_ROLE_LABELS) as SeatRole[]).filter((item) => present.has(item));
  }, [report.byTeam]);
  const rows = useMemo(() => {
    const filtered = role === "all" ? report.byTeam : report.byTeam.filter((row) => row.staff.role === role);
    return sortTeamRows(filtered, sortKey, direction);
  }, [report.byTeam, role, sortKey, direction]);
  const { highlights } = report;
  const biggestJobOwner = highlights.biggestJob
    ? (report.byTeam.find((row) => row.staff.name === highlights.biggestJob?.owner)?.staff ?? {
        name: highlights.biggestJob.owner,
      })
    : undefined;

  function toggleSort(key: TeamSortKey) {
    if (key === sortKey) setDirection((current) => (current === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setDirection("desc");
    }
  }

  const roleItems = [{ value: "all", label: "All roles" }, ...roles.map((item) => ({ value: item, label: SEAT_ROLE_LABELS[item] }))];

  return (
    <>
      <StatGrid className="xl:grid-cols-4">
        <HighlightCard
          eyebrow="Top closer"
          person={highlights.topCloser?.staff}
          value={highlights.topCloser ? formatCurrency(highlights.topCloser.wonValue) : "—"}
          hint={
            highlights.topCloser
              ? `${highlights.topCloser.won} jobs won · ${formatShare(highlights.topCloser.closeRate)} close`
              : "No closed work in range"
          }
        />
        <HighlightCard
          eyebrow="Biggest job"
          person={biggestJobOwner}
          value={highlights.biggestJob ? formatCurrencyFull(highlights.biggestJob.value) : "—"}
          hint={highlights.biggestJob?.name ?? "No signed contracts in range"}
        />
        <HighlightCard
          eyebrow="Most assigned jobs"
          person={highlights.mostAssigned?.staff}
          value={highlights.mostAssigned ? String(highlights.mostAssigned.assigned) : "—"}
          hint="jobs assigned"
        />
        <HighlightCard
          eyebrow="Most qualified leads"
          person={highlights.mostQualified?.staff}
          value={highlights.mostQualified ? String(highlights.mostQualified.qualified) : "—"}
          hint="qualified leads"
        />
      </StatGrid>

      <ReportPanel
        title="Leaderboard"
        action={
          <label className="flex items-center gap-2 text-xs" style={{ color: REPORT_COLORS.muted }}>
            Role
            <Select value={role} onValueChange={(value) => setRole(String(value ?? "all"))} items={roleItems}>
              <SelectTrigger size="sm" className="w-44 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roleItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        }
        bodyClassName="px-0 pb-0"
      >
        <LeaderboardTable rows={rows} rankStyle="badge" sort={{ key: sortKey, direction, onSort: toggleSort }} />
      </ReportPanel>
    </>
  );
}

function HighlightCard({
  eyebrow,
  person,
  value,
  hint,
}: {
  eyebrow: string;
  person?: { name: string; role?: SeatRole; title?: string; photoUrl?: string };
  value: string;
  hint: string;
}) {
  return (
    <ReportCard className="px-4 py-3.5">
      <p className="text-[11px] font-semibold tracking-[0.1em] uppercase" style={{ color: REPORT_COLORS.muted }}>
        {eyebrow}
      </p>
      <div className="mt-2.5 flex items-center gap-2.5">
        <PersonAvatar name={person?.name ?? "—"} photoUrl={person?.photoUrl} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" style={{ color: REPORT_COLORS.ink }}>
            {person?.name ?? "—"}
          </p>
          {person?.role ? (
            <p className="text-xs" style={{ color: REPORT_COLORS.muted }}>
              {SEAT_ROLE_LABELS[person.role]}
            </p>
          ) : null}
        </div>
      </div>
      <p className="mt-3 flex items-baseline gap-2">
        <span className="text-[1.5rem] leading-none font-semibold tracking-tight tabular-nums" style={{ color: REPORT_COLORS.ink }}>
          {value}
        </span>
        <span className="truncate text-xs" style={{ color: REPORT_COLORS.muted }}>
          {hint}
        </span>
      </p>
    </ReportCard>
  );
}

function LeaderboardTable({
  rows,
  rankStyle,
  sort,
}: {
  rows: TeamRow[];
  rankStyle: "plain" | "badge";
  sort?: { key: TeamSortKey; direction: "asc" | "desc"; onSort: (key: TeamSortKey) => void };
}) {
  const maxWon = Math.max(...rows.map((row) => row.wonValue), 1);
  const head = (label: string, key: TeamSortKey, className?: string) => {
    if (!sort) return <TableHead className={className}>{label}</TableHead>;
    const active = sort.key === key;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => sort.onSort(key)}
          className={cn("inline-flex items-center gap-1 uppercase hover:text-foreground", active && "text-foreground")}
        >
          {label}
          {active ? (
            <ChevronDown className={cn("size-3", sort.direction === "asc" && "rotate-180")} />
          ) : (
            <ArrowUpDown className="size-3 opacity-50" />
          )}
        </button>
      </TableHead>
    );
  };
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-12 pl-4">{rankStyle === "badge" ? "Rank" : "#"}</TableHead>
          <TableHead>Owner</TableHead>
          {head("Won value", "wonValue")}
          {head("Jobs", "won", "text-right")}
          {head("Close rate", "closeRate", "text-right")}
          {head("Qualified close", "qualifiedClose", "text-right")}
          {head("Avg job size", "avgJob", "pr-4 text-right")}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? <EmptyRow cols={7} /> : null}
        {rows.map((row, index) => (
          <TableRow key={row.staff.id}>
            <TableCell className="pl-4">
              {rankStyle === "badge" ? (
                <RankBadge rank={index + 1} />
              ) : (
                <span className="tabular-nums" style={{ color: REPORT_COLORS.muted }}>
                  {index + 1}
                </span>
              )}
            </TableCell>
            <TableCell>
              <PersonCell name={row.staff.name} subtitle={SEAT_ROLE_LABELS[row.staff.role]} photoUrl={row.staff.photoUrl} />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2.5">
                <ShareBar value={row.wonValue / maxWon} color={REPORT_COLORS.blue} track="#eef0f3" className="w-32 shrink-0 sm:w-44" />
                <span className="w-16 text-right font-semibold tabular-nums">{formatCurrency(row.wonValue)}</span>
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.won}</TableCell>
            <TableCell className="text-right tabular-nums">{Math.round(row.closeRate * 100)}%</TableCell>
            <TableCell className="text-right tabular-nums">{Math.round(row.qualifiedClose * 100)}%</TableCell>
            <TableCell className="pr-4 text-right tabular-nums">{formatCurrencyFull(row.avgJob)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/* ----------------------------------------------------------------------------
 * Lost jobs
 * -------------------------------------------------------------------------- */

function LostTab({ report }: { report: PerformanceReport }) {
  const [reason, setReason] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const { kpis } = report;
  const filtered = useMemo(
    () => filterLostJobs(report.lostJobs, reason === "all" ? null : reason, query),
    [report.lostJobs, reason, query],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / LOST_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * LOST_PAGE_SIZE, (safePage + 1) * LOST_PAGE_SIZE);
  const reasonItems = [{ value: "all", label: "All reasons" }, ...report.lostReasons.map((row) => ({ value: row.reason, label: row.reason }))];

  return (
    <>
      <StatGrid className="xl:grid-cols-5">
        <StatCard
          label="Highest lost value"
          value={formatCurrencyFull(kpis.highestLost)}
          tone="orange"
          hint={kpis.highestLostJob ? `${kpis.highestLostJob.name} · ${kpis.highestLostJob.reason}` : "No lost jobs in range"}
        />
        <StatCard
          label="Top reason"
          value={clip(kpis.topLostReason, 18)}
          hint={
            kpis.lostCount
              ? `${kpis.topLostReasonCount} jobs · ${formatShare(kpis.topLostReasonCount / kpis.lostCount)} of lost`
              : "Most frequent lost reason"
          }
        />
        <StatCard label="Avg days to loss" value={kpis.daysToLoss.toFixed(0)} hint="Created → marked lost" />
        <StatCard label="Lost average" value={formatCurrencyFull(kpis.lostAvg)} hint={`Across ${kpis.lostCount} lost jobs`} />
        <StatCard label="Total lost opportunity" value={formatCurrency(kpis.lostTotal)} tone="orange" hint="Sum of lost job value" />
      </StatGrid>

      <ReportPanel title="Lost reasoning" bodyClassName="px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Reason</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead>Share of jobs</TableHead>
              <TableHead className="text-right">Lost value</TableHead>
              <TableHead>Share of value</TableHead>
              <TableHead className="text-right">Avg value</TableHead>
              <TableHead className="pr-4 text-right">Avg days</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.lostReasons.length === 0 ? <EmptyRow cols={7} /> : null}
            {report.lostReasons.map((row) => (
              <TableRow key={row.reason}>
                <TableCell className="pl-4 font-semibold">{row.reason}</TableCell>
                <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                <TableCell>
                  <BarCell value={row.pctCount} label={formatShare(row.pctCount)} color={REPORT_COLORS.orange} track="#f3e4dc" />
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatCurrencyFull(row.value)}</TableCell>
                <TableCell>
                  <BarCell value={row.pctValue} label={formatShare(row.pctValue)} color={REPORT_COLORS.orangeDark} track="#f3e4dc" />
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrencyFull(row.avgValue)}</TableCell>
                <TableCell className="pr-4 text-right tabular-nums">{row.avgDays.toFixed(0)}</TableCell>
              </TableRow>
            ))}
            {report.lostReasons.length ? (
              <TotalRow>
                <TableCell className="pl-4">Total</TableCell>
                <TableCell className="text-right tabular-nums">{kpis.lostCount}</TableCell>
                <TableCell className="text-right tabular-nums">100%</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrencyFull(kpis.lostTotal)}</TableCell>
                <TableCell className="text-right tabular-nums">100%</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrencyFull(kpis.lostAvg)}</TableCell>
                <TableCell className="pr-4 text-right tabular-nums">{kpis.daysToLoss.toFixed(0)}</TableCell>
              </TotalRow>
            ) : null}
          </TableBody>
        </Table>
      </ReportPanel>

      <ReportPanel
        title="Lost jobs"
        action={
          <>
            <label className="flex items-center gap-2 text-xs" style={{ color: REPORT_COLORS.muted }}>
              Reason
              <Select
                value={reason}
                onValueChange={(value) => {
                  setReason(String(value ?? "all"));
                  setPage(0);
                }}
                items={reasonItems}
              >
                <SelectTrigger size="sm" className="w-44 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {reasonItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex items-center gap-2 text-xs" style={{ color: REPORT_COLORS.muted }}>
              Search
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
                placeholder="Job or address"
                className="h-7 w-40 bg-white text-xs"
              />
            </label>
          </>
        }
        footer={
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {filtered.length
                ? `Showing ${safePage * LOST_PAGE_SIZE + 1}–${Math.min(filtered.length, (safePage + 1) * LOST_PAGE_SIZE)} of ${filtered.length} · each job opens its opportunity`
                : "No lost jobs match."}
            </span>
            {pageCount > 1 ? (
              <span className="flex gap-1.5">
                <Button type="button" size="sm" variant="outline" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                  Previous
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
                  Next
                </Button>
              </span>
            ) : null}
          </span>
        }
        bodyClassName="px-0 pb-0"
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Job</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="pr-4">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? <EmptyRow cols={7} message={query || reason !== "all" ? "No lost jobs match this filter." : undefined} /> : null}
            {visible.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="pl-4">
                  <Link href={`/opportunities/${row.id}`} className="font-semibold hover:underline" style={{ color: REPORT_COLORS.blue }}>
                    {row.name}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[16rem] truncate" style={{ color: REPORT_COLORS.muted }}>
                  {row.location || "—"}
                </TableCell>
                <TableCell>{row.source}</TableCell>
                <TableCell>{row.owner || "—"}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatCurrencyFull(row.value)}</TableCell>
                <TableCell>
                  <Pill>{row.reason}</Pill>
                </TableCell>
                <TableCell className="pr-4" style={{ color: REPORT_COLORS.muted }}>
                  {formatDate(row.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ReportPanel>
    </>
  );
}

/* ----------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------- */

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
