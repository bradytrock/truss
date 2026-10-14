"use client";

import { useState } from "react";
import Link from "next/link";
import { CommissionSheetView } from "@/components/commission-sheet";
import { EmptyState, ErrorBanner, LoadingScreen, Metric, MetricStrip, PageHeader } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import {
  buildCommissionSheet,
  isCommissionInYear,
  pmCloseoutStatusLabel,
  splitsForViewer,
  type CommissionCloseout,
  type CommissionSheet,
} from "@/lib/commission-closeout";
import { expensesForJob, forecastedExpensesForJob, paymentsForJob } from "@/lib/job-financials";
import { jobRecordHref } from "@/lib/job-record";
import { formatDate, formatMoney } from "@/lib/format";
import type { Job } from "@/lib/types";

type CommissionRow = {
  closeout: CommissionCloseout;
  job: Job;
  customer: string;
  check: number;
  when: string | null;
  sheet: CommissionSheet;
};

export function CommissionsDesk() {
  const crm = useCrm();
  const actor = crm.effectiveStaff;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const year = new Date().getFullYear();

  if (!crm.hydrated) return <LoadingScreen />;

  const rows: CommissionRow[] = [];
  if (actor) {
    for (const closeout of crm.commissionCloseouts ?? []) {
      const job = crm.jobs.find((item) => item.id === closeout.jobId);
      if (!job) continue;
      const client = job.clientId ? crm.clients.find((item) => item.id === job.clientId) : null;
      const contact = job.primaryContactId ? crm.contacts.find((item) => item.id === job.primaryContactId) : null;
      const sheet = buildCommissionSheet({
        job,
        client,
        contact,
        opportunity: job.opportunityId ? crm.opportunities.find((item) => item.id === job.opportunityId) ?? null : null,
        claim: (crm.jobInsurance ?? []).find((item) => item.jobId === job.id) ?? null,
        payments: paymentsForJob(job.id, crm.payments, crm.invoices),
        expenses: expensesForJob(job.id, crm.expenses),
        forecasts: forecastedExpensesForJob(job.id, crm.forecastedExpenses ?? []),
        qbLines: closeout.qbLines,
        splits: closeout.splits,
        expenseAdjustments: closeout.expenseAdjustments,
        closingDate: job.substantialCompletion ?? closeout.submittedAt,
      });
      const lines = splitsForViewer({
        splits: sheet.splits,
        viewerName: actor.name,
        viewerStaffId: actor.id,
        projectManager: job.projectManager,
        ownerStaffId: job.ownerStaffId,
        releasedToStaffId: closeout.releasedToStaffId,
        releasedToName: closeout.releasedToName,
      });
      if (lines.length === 0) continue;
      rows.push({
        closeout,
        job,
        customer: contact?.name?.trim() || client?.name?.trim() || job.name,
        check: lines.reduce((sum, line) => sum + line.check, 0),
        when: closeout.payoutMarkedAt || closeout.submittedAt,
        sheet,
      });
    }
  }
  rows.sort((a, b) => (b.when ?? "").localeCompare(a.when ?? ""));

  const paid = rows
    .filter((row) => row.closeout.status === "payout" && isCommissionInYear(row.closeout.payoutMarkedAt || row.when, year))
    .reduce((sum, row) => sum + row.check, 0);
  const ready = rows
    .filter((row) => row.closeout.status === "released")
    .reduce((sum, row) => sum + row.check, 0);
  const selected = rows.find((row) => row.closeout.id === selectedId) ?? rows[0] ?? null;

  return (
    <div className="space-y-5">
      {crm.hydrateError ? <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} /> : null}
      <PageHeader
        eyebrow="Money"
        title="Commissions"
        description={`Your checks on jobs sent for closeout. Paid ${year} is what was marked for payout this year.`}
      />
      <MetricStrip className="sm:grid-cols-3">
        <Metric label={`Paid ${year}`} value={formatMoney(paid)} hint="Marked for payout this year" />
        <Metric label="Ready" value={formatMoney(ready)} hint="Ready for review, not marked yet" />
        <Metric label="Closeouts" value={String(rows.length)} hint="Jobs with a check in your name" />
      </MetricStrip>
      {rows.length === 0 ? (
        <EmptyState
          title="No commissions yet"
          description="Send a job for closeout from the job. Your check shows up here once the sheet exists."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
          <ul className="space-y-2">
            {rows.map((row) => {
              const active = selected?.closeout.id === row.closeout.id;
              return (
                <li key={row.closeout.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.closeout.id)}
                    className={`w-full rounded-md border px-3 py-2 text-left ${active ? "border-foreground" : ""}`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{row.job.code || row.job.name}</span>
                      <span className="text-sm tabular-nums">{formatMoney(row.check)}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {row.customer}
                      {" · "}
                      {pmCloseoutStatusLabel(row.closeout.status)}
                      {row.when ? ` · ${formatDate(row.when)}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {selected ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  Your check on this job is <span className="font-medium text-foreground tabular-nums">{formatMoney(selected.check)}</span>.
                </p>
                <Link
                  href={jobRecordHref(selected.job.id, { tab: "financials" })}
                  className="text-sm text-primary hover:underline"
                >
                  Open job
                </Link>
              </div>
              <CommissionSheetView sheet={selected.sheet} closeout={selected.closeout} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
