"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorBanner, LoadingScreen, Metric, MetricStrip, PageHeader } from "@/components/page-chrome";
import { JobStatusBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatCurrency, formatCurrencyFull, formatRelative } from "@/lib/format";
import { buildReports } from "@/lib/reports";
import { BdRoiPanel } from "@/components/bd-roi";
import { SEAT_ROLE_LABELS } from "@/lib/types";
import { accessScope, canViewReports } from "@/lib/visibility";
import { isBusinessDevelopment } from "@/lib/bd";

export default function ReportsPage() {
  const crm = useCrm();
  const viewer = crm.viewer;

  const report = useMemo(() => {
    if (!viewer) return null;
    return buildReports(crm.book, viewer);
  }, [crm.book, viewer]);

  if (!crm.hydrated) return <LoadingScreen />;

  if (!viewer || !canViewReports(viewer.role)) {
    return (
      <EmptyState
        title="Reports are restricted"
        description="Project managers and field seats work from their own jobs. Company admin, business development, and team leads run reports."
        action={
          <Link href="/" className="text-sm font-medium text-primary hover:underline">
            Back to home
          </Link>
        }
      />
    );
  }

  if (!report) return <LoadingScreen />;

  const scope = accessScope(viewer.role);
  const isBd = isBusinessDevelopment(viewer.role);
  const showTeamActivity = scope === "team" || scope === "company";

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.resetDemo()} />
      ) : null}
      <PageHeader
        eyebrow="Reporting"
        title={isBd ? "Business development ROI" : scope === "team" ? "Team reports" : "Company reports"}
        description={
          isBd
            ? `Your numbers and the company BD book for ${report.year}. Credit stays with the person who opened the lead.`
            : scope === "team"
              ? "Every job owned by your team, plus activity from people assigned to you. Login As a teammate to inspect their book."
              : "Company-wide jobs, revenue, BD ROI, and team activity."
        }
      />

      {isBd || scope === "company" ? <BdRoiPanel state={crm.book} viewer={viewer} /> : null}

      {isBd ? null : (
        <>
      <MetricStrip className="sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Open jobs" value={String(report.openJobs.length)} hint="Precon, in progress, punch" />
        <Metric
          label={`Closed jobs ${report.year}`}
          value={String(report.closedYtd.length)}
          hint="Substantial completion this year"
        />
        <Metric
          label="Referral partners"
          value={String(report.referralByPm.reduce((sum, row) => sum + row.referralPartners, 0))}
          hint="In project managers’ books"
        />
        <Metric label={`YTD revenue`} value={formatCurrency(report.ytdRevenue)} hint="Payments received this year" />
      </MetricStrip>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Referral partners by PM</CardTitle>
          <CardDescription>
            Count of people marked as referral partners in each project manager’s contact book.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project manager</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="text-right">Contacts</TableHead>
                <TableHead className="text-right">Referral partners</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.referralByPm.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No project managers in this company yet.
                  </TableCell>
                </TableRow>
              ) : (
                report.referralByPm.map((row) => {
                  const team = crm.book.teams.find((item) => item.id === row.staff.teamId);
                  return (
                    <TableRow key={row.staff.id}>
                      <TableCell>
                        <p className="font-medium">{row.staff.name}</p>
                        <p className="text-xs text-muted-foreground">{SEAT_ROLE_LABELS[row.staff.role]}</p>
                      </TableCell>
                      <TableCell>{team?.name ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.contacts}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.referralPartners}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Jobs in this view</CardTitle>
          <CardDescription>Jobs this seat is allowed to report on.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>PM</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Contract</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>
                    <Link href={`/jobs/${job.id}`} className="font-medium hover:underline">
                      {job.name}
                    </Link>
                    {job.code ? (
                      <p className="font-mono text-xs text-muted-foreground">{job.code}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>{job.projectManager}</TableCell>
                  <TableCell>
                    <JobStatusBadge status={job.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrencyFull(job.contractValue)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {showTeamActivity ? (
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Team activity</CardTitle>
            <CardDescription>Notes, calls, and stage changes from people assigned to this team.</CardDescription>
          </CardHeader>
          <CardContent>
            {report.activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity logged for this team yet.</p>
            ) : (
              <ul className="divide-y">
                {report.activity.slice(0, 12).map((item) => (
                  <li key={item.id} className="py-3 first:pt-0">
                    <p className="text-sm">{item.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.author} · {formatRelative(item.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
        </>
      )}
    </div>
  );
}

