"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyRow, Num, ReportPanel, StatCard, StatGrid, TotalRow, YouBadge } from "@/components/reports-chrome";
import { REPORT_COLORS } from "@/components/reports-charts";
import { formatCurrency, formatCurrencyFull } from "@/lib/format";
import { buildBdRoi, roiMultiple, type BdPersonStats, type BdRoiReport } from "@/lib/bd";
import { SEAT_ROLE_LABELS, type CrmState, type StaffMember } from "@/lib/types";
import { canViewProjectFinancials } from "@/lib/visibility";
import { cn } from "@/lib/utils";

function multipleLabel(cash: number, spend: number) {
  const multiple = roiMultiple(cash, spend);
  if (multiple === null) return "—";
  return `${multiple.toFixed(1)}×`;
}

const SHADED = "bg-[#f5f6f8]";

export function bdRoiCsvRows(report: BdRoiReport, books: boolean) {
  const line = (label: string, row: Omit<BdPersonStats, "staff">) => [
    label,
    row.agents,
    row.leads,
    row.openValue,
    row.wonValue,
    ...(books ? [row.cash, row.spend, multipleLabel(row.cash, row.spend)] : []),
  ];
  return [
    ...report.people.map((row) => line(row.staff.name, row)),
    ...(report.people.length > 1 ? [line("Company", report.company)] : []),
  ];
}

export function bdRoiCsvHeaders(books: boolean) {
  return ["Person", "Agents", "Leads", "Open $", "Sold $", ...(books ? ["Cash in", "Spend", "ROI"] : [])];
}

export function BdRoiPanel({ state, viewer }: { state: CrmState; viewer: StaffMember }) {
  const report = buildBdRoi(state);
  const mine = report.people.find((row) => row.staff.id === viewer.id);
  const books = canViewProjectFinancials(viewer.role);

  return (
    <div className="space-y-5">
      {mine ? (
        <section className="space-y-3">
          <h2 className="flex items-baseline gap-2 text-sm">
            <span className="font-semibold" style={{ color: REPORT_COLORS.ink }}>
              You
            </span>
            <span className="text-xs" style={{ color: REPORT_COLORS.muted }}>
              {viewer.name} · {viewer.title || SEAT_ROLE_LABELS[viewer.role]}
            </span>
          </h2>
          <StatGrid className={books ? "xl:grid-cols-4" : ""}>
            <StatCard label="Your open pipeline" value={formatCurrency(mine.openValue)} hint="Open jobs you sourced" />
            <StatCard
              label={`Jobs sold this year`}
              value={String(mine.won)}
              tone="blue"
              hint={`${formatCurrency(mine.wonValue)} signed`}
            />
            {books ? (
              <>
                <StatCard label="Cash on your jobs" value={formatCurrency(mine.cash)} hint="Collected to date" />
                <StatCard
                  label="Your ROI multiple"
                  value={multipleLabel(mine.cash, mine.spend)}
                  tone="blue"
                  hint={
                    mine.spend
                      ? `Cash ÷ ${formatCurrency(mine.spend)} spend`
                      : "Log office expenses to see a multiple"
                  }
                />
              </>
            ) : null}
          </StatGrid>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold" style={{ color: REPORT_COLORS.ink }}>
          Company business development
        </h2>
        <StatGrid className={books ? "xl:grid-cols-4" : ""}>
          <StatCard label="Company BD pipeline" value={formatCurrency(report.company.openValue)} hint="Open BD-sourced jobs" />
          <StatCard
            label="BD jobs sold"
            value={String(report.company.won)}
            tone="blue"
            hint={`${formatCurrency(report.company.wonValue)} signed`}
          />
          {books ? (
            <>
              <StatCard
                label="Cash from BD-sourced jobs"
                value={formatCurrency(report.company.cash)}
                hint={
                  report.companyCash
                    ? `Collected to date · ${Math.round(report.bdShare * 100)}% of company cash`
                    : "Collected to date"
                }
              />
              <StatCard
                label="Company BD ROI"
                value={multipleLabel(report.company.cash, report.company.spend)}
                tone="blue"
                hint={
                  report.company.spend
                    ? `Cash ÷ ${formatCurrency(report.company.spend)} spend`
                    : "Add BD office expenses to complete the multiple"
                }
              />
            </>
          ) : null}
        </StatGrid>
      </section>

      <ReportPanel
        title="By person"
        action={
          books ? (
            <p className="text-xs" style={{ color: REPORT_COLORS.muted }}>
              Shaded columns visible with financial access
            </p>
          ) : null
        }
        footer="Credit stays with whoever opened the lead, even after it is assigned to a PM or estimator. Agents are referral partners in that person’s book. ROI is cash collected on sourced jobs this year ÷ office spend they logged."
        bodyClassName="px-0 pb-0"
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Person</TableHead>
              <TableHead className="text-right">Agents</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">Open $</TableHead>
              <TableHead className="text-right">Sold $</TableHead>
              {books ? (
                <>
                  <TableHead className={cn("text-right", SHADED)}>Cash in</TableHead>
                  <TableHead className={cn("text-right", SHADED)}>Spend</TableHead>
                  <TableHead className={cn("pr-4 text-right", SHADED)}>ROI</TableHead>
                </>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.people.length === 0 ? (
              <EmptyRow cols={books ? 8 : 5} message="No business development seats yet." />
            ) : (
              report.people.map((row) => (
                <TableRow key={row.staff.id} className={cn(row.staff.id === viewer.id && "bg-[#f3f6fe] hover:bg-[#f3f6fe]")}>
                  <TableCell className="pl-4">
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      {row.staff.name}
                      {row.staff.id === viewer.id ? <YouBadge /> : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.agents}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.leads}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(row.openValue)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(row.wonValue)}</TableCell>
                  {books ? (
                    <>
                      <TableCell className={cn("text-right tabular-nums", SHADED)}>{formatCurrency(row.cash)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", SHADED)}>{formatCurrencyFull(row.spend)}</TableCell>
                      <TableCell className={cn("pr-4 text-right", SHADED)}>
                        <Num tone="blue" bold>
                          {multipleLabel(row.cash, row.spend)}
                        </Num>
                      </TableCell>
                    </>
                  ) : null}
                </TableRow>
              ))
            )}
            {report.people.length > 1 ? (
              <TotalRow>
                <TableCell className="pl-4">Company</TableCell>
                <TableCell className="text-right tabular-nums">{report.company.agents}</TableCell>
                <TableCell className="text-right tabular-nums">{report.company.leads}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(report.company.openValue)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(report.company.wonValue)}</TableCell>
                {books ? (
                  <>
                    <TableCell className={cn("text-right tabular-nums", SHADED)}>{formatCurrency(report.company.cash)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", SHADED)}>{formatCurrencyFull(report.company.spend)}</TableCell>
                    <TableCell className={cn("pr-4 text-right tabular-nums", SHADED)}>
                      {multipleLabel(report.company.cash, report.company.spend)}
                    </TableCell>
                  </>
                ) : null}
              </TotalRow>
            ) : null}
          </TableBody>
        </Table>
      </ReportPanel>
    </div>
  );
}
