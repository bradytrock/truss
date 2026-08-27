"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { QbStatusBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatDate, formatMoney } from "@/lib/format";
import {
  expensesForJob,
  paymentsForJob,
  type JobBooksBasis,
} from "@/lib/job-financials";
import { buildProfitAndLoss, jobPeriodBounds } from "@/lib/profit-and-loss";
import { ProfitAndLossReport } from "@/components/profit-and-loss";
import { EXPENSE_ACCOUNT_LABELS, type Job } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LogExpenseDialog, LogPaymentDialog } from "@/components/log-financial-dialogs";
import { jobDocumentHref, latestReturnNote } from "@/lib/qb-review";

export function JobFinancials({ job }: { job: Job }) {
  const crm = useCrm();
  const [basis, setBasis] = useState<JobBooksBasis>("accrual");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const period = useMemo(() => jobPeriodBounds(job), [job]);

  const statement = useMemo(
    () =>
      buildProfitAndLoss({
        companyName: crm.company.name,
        jobs: crm.jobs,
        opportunities: crm.opportunities,
        invoices: crm.invoices,
        invoiceLines: crm.invoiceLines,
        payments: crm.payments,
        expenses: crm.expenses,
        estimates: crm.estimates,
        estimateLines: crm.estimateLines,
        basis,
        job,
        from: null,
        to: null,
        periodLabel: period.periodLabel,
      }),
    [
      basis,
      crm.company.name,
      crm.expenses,
      crm.estimateLines,
      crm.estimates,
      crm.invoiceLines,
      crm.invoices,
      crm.jobs,
      crm.opportunities,
      crm.payments,
      job,
      period.periodLabel,
    ],
  );
  const expenses = expensesForJob(job.id, crm.expenses).sort((a, b) =>
    b.incurredAt.localeCompare(a.incurredAt),
  );
  const payments = paymentsForJob(job.id, crm.payments, crm.invoices).sort((a, b) =>
    b.paidAt.localeCompare(a.paidAt),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Same statement as QuickBooks: income, cost of sales, gross profit, then overhead.
        </p>
        <div className="flex flex-wrap gap-2">
          <div className="flex border">
            <button
              type="button"
              className={cn(
                "px-3 py-1.5 text-xs font-medium",
                basis === "accrual" ? "bg-foreground text-background" : "text-muted-foreground",
              )}
              onClick={() => setBasis("accrual")}
            >
              Accrual
            </button>
            <button
              type="button"
              className={cn(
                "px-3 py-1.5 text-xs font-medium",
                basis === "cash" ? "bg-foreground text-background" : "text-muted-foreground",
              )}
              onClick={() => setBasis("cash")}
            >
              Cash
            </button>
          </div>
          <Button size="sm" variant="outline" onClick={() => setExpenseOpen(true)}>
            Log expense
          </Button>
          <Button size="sm" onClick={() => setPaymentOpen(true)}>
            Log payment
          </Button>
        </div>
      </div>

      <ProfitAndLossReport statement={statement} />

      <div>
        <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] uppercase">Expenses</p>
        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No expenses on this job yet. Photograph the receipt, then save.
          </p>
        ) : (
          <ul className="space-y-3">
            {expenses.map((expense) => {
              const returned = latestReturnNote(crm.qbReviewComments ?? [], "expense", expense.id);
              return (
              <li key={expense.id} className="grid gap-3 border sm:grid-cols-[7rem_1fr]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <a href={expense.receiptUrl} target="_blank" rel="noreferrer">
                  <img
                    src={expense.receiptUrl}
                    alt={`Receipt for ${expense.vendor}`}
                    className="h-28 w-full object-cover sm:h-full"
                  />
                </a>
                <div className="space-y-1 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{expense.vendor}</p>
                    <span className="tabular-nums text-sm">{formatMoney(expense.amount)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {expense.number} · {EXPENSE_ACCOUNT_LABELS[expense.account]} · {formatDate(expense.incurredAt)}
                  </p>
                  {expense.memo ? <p className="text-sm leading-snug">{expense.memo}</p> : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <QbStatusBadge status={expense.qbStatus} />
                    <Link
                      href={jobDocumentHref(job.id, "expense", expense.id)}
                      className={
                        expense.qbStatus === "returned"
                          ? "text-xs font-medium text-primary hover:underline"
                          : "text-xs text-muted-foreground hover:underline"
                      }
                    >
                      {expense.qbStatus === "returned" && returned
                        ? `Accounting asked: ${returned.body}`
                        : "Open file"}
                    </Link>
                  </div>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] uppercase">Payments</p>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No receipts recorded against this job.</p>
        ) : (
          <ul className="space-y-3">
            {payments.map((payment) => {
              const invoice = payment.invoiceId
                ? crm.invoices.find((item) => item.id === payment.invoiceId)
                : undefined;
              return (
                <li key={payment.id} className="grid gap-3 border sm:grid-cols-[7rem_1fr]">
                  {payment.receiptUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a href={payment.receiptUrl} target="_blank" rel="noreferrer">
                      <img
                        src={payment.receiptUrl}
                        alt="Payment receipt"
                        className="h-28 w-full object-cover sm:h-full"
                      />
                    </a>
                  ) : (
                    <div className="bg-muted" />
                  )}
                  <div className="space-y-1 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{payment.method}</p>
                      <span className="tabular-nums text-sm">{formatMoney(payment.amount)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(payment.paidAt)}
                      {invoice ? (
                        <>
                          {" · "}
                          <Link href={`/invoices/${invoice.id}`} className="hover:underline">
                            {invoice.number}
                          </Link>
                        </>
                      ) : (
                        " · unapplied"
                      )}
                      {payment.reference ? ` · ${payment.reference}` : ""}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                    <QbStatusBadge status={payment.qbStatus} />
                    {payment.qbStatus === "returned" ? (
                      <Link
                        href={jobDocumentHref(job.id, "payment", payment.id)}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Accounting asked for a change
                      </Link>
                    ) : (
                      <Link
                        href={jobDocumentHref(job.id, "payment", payment.id)}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        Open file
                      </Link>
                    )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <LogExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} defaultJobId={job.id} />
      <LogPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} defaultJobId={job.id} />
    </div>
  );
}
