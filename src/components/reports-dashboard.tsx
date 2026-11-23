"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { REPORT_COLORS } from "@/components/reports-charts";
import { Segmented } from "@/components/reports-chrome";
import {
  JobsTab,
  LeadsTab,
  LostTab,
  OverviewTab,
  PipelineTab,
  TeamTab,
  WorkflowTab,
} from "@/components/reports-tabs";
import { ErrorBanner } from "@/components/page-chrome";
import { BdRoiPanel, bdRoiCsvHeaders, bdRoiCsvRows } from "@/components/bd-roi";
import { CardAnalyticsReport } from "@/components/card-analytics-report";
import { PersonReportPanel } from "@/components/person-report-panel";
import { buildBdRoi, isBusinessDevelopment } from "@/lib/bd";
import { buildPersonDetail, personWonCsv } from "@/lib/person-report";
import type { CardPersonRow, CardRange } from "@/lib/card-analytics";
import {
  DATE_PRESETS,
  REPORT_SCOPE_LABELS,
  REPORT_TABS,
  buildPerformance,
  formatShare,
  rangeLabel,
  type DatePreset,
  type ReportTab,
} from "@/lib/reports";
import { SEAT_ROLE_LABELS, type CrmState, type StaffMember } from "@/lib/types";
import {
  accessScope,
  canSeeTeamPerformance,
  canViewProjectFinancials,
  reportScopeOptions,
  scopeBook,
  type AccessScope,
} from "@/lib/visibility";

function isReportTab(value: string | null): value is ReportTab {
  return Boolean(value && REPORT_TABS.some((item) => item.id === value));
}

export function ReportsDashboard({
  viewer,
  book: roleBook,
  companyName,
  hydrateError,
  onReload,
}: {
  viewer: StaffMember;
  /** The seat's book as the store already scopes it; the scope switch only narrows it. */
  book: CrmState;
  companyName: string;
  hydrateError?: string | null;
  onReload?: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [preset, setPreset] = useState<DatePreset>("ytd");
  const [requestedTab, setRequestedTab] = useState<ReportTab | null>(() => {
    const value = searchParams.get("tab");
    return isReportTab(value) ? value : null;
  });
  const [viewScope, setViewScope] = useState<AccessScope | null>(null);
  const [cardRows, setCardRows] = useState<{ rows: CardPersonRow[]; range: CardRange } | null>(null);
  const personId = searchParams.get("person");
  const [personPreset, setPersonPreset] = useState<DatePreset>(preset);
  const [trackedPerson, setTrackedPerson] = useState<string | null>(null);
  if (personId !== trackedPerson) {
    const opening = Boolean(personId) && !trackedPerson;
    setTrackedPerson(personId);
    if (opening) setPersonPreset(preset);
  }

  const scopeOptions = useMemo(() => reportScopeOptions(viewer), [viewer]);
  const effectiveScope: AccessScope | undefined =
    viewScope && scopeOptions.includes(viewScope) ? viewScope : scopeOptions[scopeOptions.length - 1];

  const book = useMemo(() => scopeBook(roleBook, viewer, effectiveScope), [roleBook, viewer, effectiveScope]);
  const reportBook = useMemo(
    () => ({
      staff: book.staff,
      jobs: book.jobs,
      opportunities: book.opportunities,
      contacts: book.contacts,
      estimates: book.estimates,
      estimateLines: book.estimateLines,
      payments: book.payments,
      expenses: book.expenses,
    }),
    [book],
  );

  const report = useMemo(() => {
    return buildPerformance(reportBook, viewer, preset, new Date(), effectiveScope);
  }, [reportBook, viewer, preset, effectiveScope]);

  const personPerformance = useMemo(() => {
    if (!personId) return null;
    if (personPreset === preset) return report;
    return buildPerformance(reportBook, viewer, personPreset, new Date(), effectiveScope);
  }, [personId, personPreset, preset, report, reportBook, viewer, effectiveScope]);

  const personDetail = useMemo(() => {
    if (!personId || !personPerformance) return null;
    return buildPersonDetail(reportBook, personId, personPerformance.range);
  }, [personId, personPerformance, reportBook]);

  const onCardRows = useCallback((rows: CardPersonRow[], range: CardRange) => {
    setCardRows({ rows, range });
  }, []);

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
    params.delete("person");
    router.replace(`/reports?${params.toString()}`, { scroll: false });
  }

  function showPerson(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("person", id);
    if (!params.get("tab")) params.set("tab", activeTab);
    router.replace(`/reports?${params.toString()}`, { scroll: false });
  }

  function closePerson() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("person");
    router.replace(`/reports?${params.toString()}`, { scroll: false });
  }

  function exportCurrent() {
    if (personDetail) {
      const csv = personWonCsv(personDetail);
      downloadCsv(csv.filename, csv.headers, csv.rows);
      return;
    }
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
        const bd = buildBdRoi(roleBook);
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
        {hydrateError ? (
          <div className="mb-3">
            <ErrorBanner message={hydrateError} onRetry={onReload} />
          </div>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.14em] uppercase" style={{ color: REPORT_COLORS.muted }}>
              {companyName || "Reports"}
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
            {personId ? null : activeTab === "pipeline" ? (
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

        {personId ? null : (
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
        )}
      </div>

      <div className="flex-1 space-y-4 bg-[#f5f6f8] px-5 py-5 sm:px-7">
        {personId && personDetail && personPerformance ? (
          <PersonReportPanel
            detail={personDetail}
            report={personPerformance}
            preset={personPreset}
            onPreset={setPersonPreset}
            onBack={closePerson}
            onSwitch={showPerson}
          />
        ) : null}
        {personId && !personDetail ? (
          <p className="text-sm" style={{ color: REPORT_COLORS.muted }}>
            That person is not in this view.{" "}
            <button type="button" className="font-medium hover:underline" style={{ color: REPORT_COLORS.blue }} onClick={closePerson}>
              Back to the leaderboard
            </button>
          </p>
        ) : null}
        {!personId && activeTab === "overview" ? (
          <OverviewTab
            report={report}
            financials={financials}
            showTeam={showTeam}
            onViewTeam={() => selectTab("team")}
            onSelectPerson={showTeam ? showPerson : undefined}
          />
        ) : null}
        {!personId && activeTab === "jobs" ? <JobsTab report={report} financials={financials} /> : null}
        {!personId && activeTab === "leads" ? <LeadsTab report={report} /> : null}
        {!personId && activeTab === "workflow" ? <WorkflowTab report={report} /> : null}
        {!personId && activeTab === "pipeline" ? <PipelineTab report={report} /> : null}
        {!personId && activeTab === "team" && showTeam ? <TeamTab report={report} onSelectPerson={showPerson} /> : null}
        {!personId && activeTab === "lost" ? <LostTab report={report} /> : null}
        {!personId && activeTab === "cards" ? <CardAnalyticsReport onRows={onCardRows} /> : null}
        {!personId && activeTab === "bd" && showBd ? <BdRoiPanel state={roleBook} viewer={viewer} /> : null}
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
 * Helpers
 * -------------------------------------------------------------------------- */

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
