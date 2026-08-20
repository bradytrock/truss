"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
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
import { QbStatusBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatCurrencyFull, formatDate, formatMoney } from "@/lib/format";
import { invoiceTotal } from "@/lib/money";
import { qbQueue } from "@/lib/job-financials";
import { EXPENSE_ACCOUNT_LABELS } from "@/lib/types";
import { canViewAccounting } from "@/lib/visibility";

export default function AccountingPage() {
  const crm = useCrm();
  const viewer = crm.viewer;
  const queue = useMemo(
    () =>
      qbQueue({
        invoices: crm.invoices,
        invoiceLines: crm.invoiceLines,
        payments: crm.payments,
        expenses: crm.expenses,
      }),
    [crm.expenses, crm.invoiceLines, crm.invoices, crm.payments],
  );

  if (!crm.hydrated) return <LoadingScreen />;

  if (!viewer || !canViewAccounting(viewer.role)) {
    return (
      <EmptyState
        title="Accounting is restricted"
        description="Company admin and the Accounting seat see the QuickBooks entry queue. Project managers log expenses on the job."
        action={
          <Link href="/" className="text-sm font-medium text-primary hover:underline">
            Back to home
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      {crm.hydrateError ? (
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.resetDemo()} />
      ) : null}
      <PageHeader
        eyebrow="Books"
        title="Accounting"
        description="What still needs to be typed into QuickBooks Desktop. Mark a row after you enter it. The web connector comes later — receipts stay on the job either way."
      />

      <MetricStrip className="sm:grid-cols-3">
        <Metric
          label="Invoices to enter"
          value={String(queue.invoiceCount)}
          hint={formatCurrencyFull(queue.invoiceTotalDue)}
        />
        <Metric
          label="Expenses to enter"
          value={String(queue.expenseCount)}
          hint={formatCurrencyFull(queue.expenseTotal)}
        />
        <Metric
          label="Payments to enter"
          value={String(queue.paymentCount)}
          hint={formatCurrencyFull(queue.paymentTotal)}
        />
      </MetricStrip>

      <QueueCard
        title="Invoices"
        description="Create the invoice in QuickBooks, then mark it entered."
        empty="Nothing waiting. Sent invoices show up here until they are in QB."
      >
        {queue.invoices.length === 0 ? null : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Job</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.invoices.map((invoice) => {
                const job = invoice.jobId ? crm.getJob(invoice.jobId) : undefined;
                return (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      <Link href={`/invoices/${invoice.id}`} className="font-medium hover:underline">
                        {invoice.number}
                      </Link>
                      <p className="text-xs text-muted-foreground">{invoice.name}</p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {job ? (
                        <Link href={`/jobs/${job.id}?tab=financials`} className="hover:underline">
                          {job.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(invoiceTotal(invoice.id, crm.invoiceLines))}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void crm.setQbStatus("invoice", invoice.id, "entered")}
                      >
                        Mark entered
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </QueueCard>

      <QueueCard
        title="Expenses"
        description="Bills, credit cards, and checks. Open the receipt, enter it in QB, mark it here."
        empty="No expenses waiting on QuickBooks."
      >
        {queue.expenses.length === 0 ? null : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Job / account</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.expenses.map((expense) => {
                const job = expense.jobId ? crm.getJob(expense.jobId) : undefined;
                return (
                  <TableRow key={expense.id}>
                    <TableCell>
                      {expense.receiptUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <a href={expense.receiptUrl} target="_blank" rel="noreferrer">
                          <img
                            src={expense.receiptUrl}
                            alt=""
                            className="size-12 border object-cover"
                          />
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{expense.vendor}</p>
                      <p className="text-xs text-muted-foreground">
                        {expense.number} · {formatDate(expense.incurredAt)}
                        {expense.extractedByAi ? " · AI read" : ""}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">
                      <p>{job?.name ?? "Overhead"}</p>
                      <p className="text-xs text-muted-foreground">
                        {EXPENSE_ACCOUNT_LABELS[expense.account]}
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(expense.amount)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void crm.setQbStatus("expense", expense.id, "entered")}
                      >
                        Mark entered
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </QueueCard>

      <QueueCard
        title="Payments"
        description="Receive payments in QuickBooks against the same invoice, then clear the queue."
        empty="No deposits waiting on QuickBooks."
      >
        {queue.payments.length === 0 ? null : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Image</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.payments.map((payment) => {
                const invoice = payment.invoiceId
                  ? crm.invoices.find((item) => item.id === payment.invoiceId)
                  : undefined;
                return (
                  <TableRow key={payment.id}>
                    <TableCell>
                      {payment.receiptUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <a href={payment.receiptUrl} target="_blank" rel="noreferrer">
                          <img src={payment.receiptUrl} alt="" className="size-12 border object-cover" />
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{payment.method}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(payment.paidAt)}
                        {payment.reference ? ` · ${payment.reference}` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {invoice ? (
                        <Link href={`/invoices/${invoice.id}`} className="hover:underline">
                          {invoice.number}
                        </Link>
                      ) : (
                        "Unapplied"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(payment.amount)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <QbStatusBadge status={payment.qbStatus} />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void crm.setQbStatus("payment", payment.id, "entered")}
                        >
                          Mark entered
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </QueueCard>
    </div>
  );
}

function QueueCard({
  title,
  description,
  empty,
  children,
}: {
  title: string;
  description: string;
  empty: string;
  children: ReactNode;
}) {
  const isEmpty = children == null;
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isEmpty ? <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p> : children}
      </CardContent>
    </Card>
  );
}
