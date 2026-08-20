"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { QbStatusBadge } from "@/components/status-badge";
import { Metric, MetricStrip } from "@/components/page-chrome";
import { useCrm } from "@/lib/crm-store";
import { formatCurrencyFull, formatDate, formatMoney } from "@/lib/format";
import {
  expensesForJob,
  jobProfitAndLoss,
  paymentsForJob,
  type JobBooksBasis,
} from "@/lib/job-financials";
import { EXPENSE_ACCOUNT_LABELS, type Job } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LogExpenseDialog, LogPaymentDialog } from "@/components/log-financial-dialogs";

export function JobFinancials({ job }: { job: Job }) {
  const crm = useCrm();
  const [basis, setBasis] = useState<JobBooksBasis>("accrual");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const books = useMemo(
    () =>
      jobProfitAndLoss({
        job,
        invoices: crm.invoices,
        invoiceLines: crm.invoiceLines,
        payments: crm.payments,
        expenses: crm.expenses,
        basis,
      }),
    [basis, crm.expenses, crm.invoiceLines, crm.invoices, crm.payments, job],
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
        <div>
          <p className="text-sm text-muted-foreground">
            Job costing in QuickBooks language. Accrual uses invoices; cash uses money in the door.
          </p>
        </div>
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

      <MetricStrip className="sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label={basis === "cash" ? "Collected" : "Invoiced"}
          value={formatCurrencyFull(books.income)}
          hint={
            basis === "cash"
              ? `${books.paymentCount} receipts`
              : `${books.invoiceCount} invoices · ${formatCurrencyFull(books.ar)} AR`
          }
        />
        <Metric
          label="Job expenses"
          value={formatCurrencyFull(books.expenses)}
          hint={`${books.expenseCount} with receipts`}
        />
        <Metric
          label="Gross profit"
          value={formatCurrencyFull(books.profit)}
          hint={`${Math.round(books.margin * 100)}% margin`}
        />
        <Metric
          label="Contract"
          value={formatCurrencyFull(books.contractValue)}
          hint="Sold value on the job"
        />
      </MetricStrip>

      {Object.keys(books.byAccount).length > 0 ? (
        <div>
          <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] uppercase">Expenses by account</p>
          <ul className="divide-y border">
            {Object.entries(books.byAccount)
              .sort((a, b) => b[1] - a[1])
              .map(([account, amount]) => (
                <li key={account} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>
                    {EXPENSE_ACCOUNT_LABELS[account as keyof typeof EXPENSE_ACCOUNT_LABELS] ?? account}
                  </span>
                  <span className="tabular-nums">{formatMoney(amount)}</span>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] uppercase">Expenses</p>
        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No expenses on this job yet. Photograph the receipt, then save.
          </p>
        ) : (
          <ul className="space-y-3">
            {expenses.map((expense) => (
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
                  <QbStatusBadge status={expense.qbStatus} />
                </div>
              </li>
            ))}
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
                    <QbStatusBadge status={payment.qbStatus} />
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
