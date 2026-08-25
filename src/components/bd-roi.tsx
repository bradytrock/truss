"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Metric, MetricStrip } from "@/components/page-chrome";
import { formatCurrency, formatCurrencyFull } from "@/lib/format";
import { buildBdRoi, roiMultiple, type BdPersonStats } from "@/lib/bd";
import type { CrmState, StaffMember } from "@/lib/types";

function multipleLabel(cash: number, spend: number) {
  const multiple = roiMultiple(cash, spend);
  if (multiple === null) return "—";
  return `${multiple.toFixed(1)}×`;
}

function PersonRow({ row, href }: { row: BdPersonStats; href?: string }) {
  return (
    <TableRow>
      <TableCell>
        {href ? (
          <Link href={href} className="font-medium hover:underline">
            {row.staff.name}
          </Link>
        ) : (
          <span className="font-medium">{row.staff.name}</span>
        )}
        <p className="text-xs text-muted-foreground">{row.staff.title}</p>
      </TableCell>
      <TableCell className="text-right tabular-nums">{row.agents}</TableCell>
      <TableCell className="text-right tabular-nums">{row.leads}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrencyFull(row.openValue)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrencyFull(row.wonValue)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrencyFull(row.cash)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrencyFull(row.spend)}</TableCell>
      <TableCell className="text-right tabular-nums">{multipleLabel(row.cash, row.spend)}</TableCell>
    </TableRow>
  );
}

export function BdRoiPanel({
  state,
  viewer,
}: {
  state: CrmState;
  viewer: StaffMember;
}) {
  const report = buildBdRoi(state);
  const mine = report.people.find((row) => row.staff.id === viewer.id);

  return (
    <div className="space-y-5">
      {mine ? (
        <MetricStrip className="sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Your open pipeline"
            value={formatCurrency(mine.openValue)}
            hint={`${mine.openLeads} live leads · ${mine.agents} agents`}
          />
          <Metric
            label={`Your jobs sold ${report.year}`}
            value={formatCurrency(mine.wonValue)}
            hint={`${mine.won} signed · ${mine.lost} lost`}
          />
          <Metric
            label="Cash on your jobs"
            value={formatCurrency(mine.cash)}
            hint="Payments this year on work you sourced"
          />
          <Metric
            label="Your ROI"
            value={multipleLabel(mine.cash, mine.spend)}
            hint={
              mine.spend
                ? `${formatCurrency(mine.spend)} BD spend (office) this year`
                : "Log office expenses to see a multiple"
            }
          />
        </MetricStrip>
      ) : null}

      <MetricStrip className="sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Company BD pipeline"
          value={formatCurrency(report.company.openValue)}
          hint={`${report.company.openLeads} open leads from the BD team`}
        />
        <Metric
          label={`BD jobs sold ${report.year}`}
          value={formatCurrency(report.company.wonValue)}
          hint={`${report.company.won} awarded`}
        />
        <Metric
          label="Cash from BD-sourced jobs"
          value={formatCurrency(report.company.cash)}
          hint={
            report.companyCash
              ? `${Math.round(report.bdShare * 100)}% of company cash this year`
              : "No payments this year yet"
          }
        />
        <Metric
          label="Company BD ROI"
          value={multipleLabel(report.company.cash, report.company.spend)}
          hint={
            report.company.spend
              ? `${formatCurrency(report.company.spend)} team spend vs cash in`
              : "Add BD office expenses to complete the multiple"
          }
        />
      </MetricStrip>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>ROI by business development</CardTitle>
          <CardDescription>
            Credit stays with whoever opened the lead, even after it is assigned to a PM or estimator.
            Agents are referral partners in that person’s book. Spend is office expenses they logged.
            ROI is cash collected on their sourced jobs this year ÷ that spend.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead className="text-right">Agents</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Open $</TableHead>
                <TableHead className="text-right">Sold $</TableHead>
                <TableHead className="text-right">Cash in</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">ROI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.people.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">
                    No business development seats yet.
                  </TableCell>
                </TableRow>
              ) : (
                report.people.map((row) => <PersonRow key={row.staff.id} row={row} />)
              )}
              {report.people.length > 1 ? (
                <TableRow>
                  <TableCell className="font-medium">Company BD</TableCell>
                  <TableCell className="text-right tabular-nums">{report.company.agents}</TableCell>
                  <TableCell className="text-right tabular-nums">{report.company.leads}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrencyFull(report.company.openValue)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrencyFull(report.company.wonValue)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrencyFull(report.company.cash)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrencyFull(report.company.spend)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {multipleLabel(report.company.cash, report.company.spend)}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
