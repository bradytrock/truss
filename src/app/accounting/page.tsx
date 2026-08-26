"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
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
import { ProfitAndLossReport } from "@/components/profit-and-loss";
import { QbStatusBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatCurrencyFull, formatDate, formatMoney } from "@/lib/format";
import { invoiceTotal } from "@/lib/money";
import { qbQueue, type JobBooksBasis } from "@/lib/job-financials";
import { buildProfitAndLoss, formatPnlPeriod, yearToDateBounds } from "@/lib/profit-and-loss";
import { EXPENSE_ACCOUNT_LABELS } from "@/lib/types";
import { canViewAccounting } from "@/lib/visibility";
import { expensePushBlocked, invoicePushBlocked, paymentPushBlocked } from "@/lib/qbwc/work";
import type { QbSyncStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function AccountingPage() {
  const crm = useCrm();
  const viewer = crm.effectiveStaff;
  const [basis, setBasis] = useState<JobBooksBasis>("accrual");
  const [span, setSpan] = useState<"ytd" | "all">("ytd");
  const ytd = useMemo(() => yearToDateBounds(), []);
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
  const statement = useMemo(() => {
    const dated = [
      ...crm.invoices.map((invoice) => invoice.issuedAt),
      ...crm.payments.map((payment) => payment.paidAt),
      ...crm.expenses.map((expense) => expense.incurredAt),
      ...crm.estimates.map((estimate) => estimate.sentAt || estimate.createdAt),
    ]
      .map((value) => value.slice(0, 10))
      .filter(Boolean)
      .sort();
    const from = span === "ytd" ? ytd.from : dated[0] ?? ytd.from;
    const to = ytd.to;
    return buildProfitAndLoss({
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
      from,
      to,
      periodLabel: formatPnlPeriod(from, to),
    });
  }, [
    basis,
    crm.company.name,
    crm.estimateLines,
    crm.estimates,
    crm.expenses,
    crm.invoiceLines,
    crm.invoices,
    crm.jobs,
    crm.opportunities,
    crm.payments,
    span,
    ytd.from,
    ytd.to,
  ]);

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
        <ErrorBanner message={crm.hydrateError} onRetry={() => void crm.reload()} />
      ) : null}
      <PageHeader
        eyebrow="Books"
        title="Accounting"
        description="Profit and loss in QuickBooks form, plus the queue. Approve opens the document next to the fields that post to QuickBooks."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button nativeButton={false} render={<Link href="/accounting/approve" />}>
              Approve
            </Button>
            <Button nativeButton={false} variant="outline" render={<Link href="/settings/quickbooks" />}>
              Web Connector
            </Button>
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
            <div className="flex border">
              <button
                type="button"
                className={cn(
                  "px-3 py-1.5 text-xs font-medium",
                  span === "ytd" ? "bg-foreground text-background" : "text-muted-foreground",
                )}
                onClick={() => setSpan("ytd")}
              >
                Year to date
              </button>
              <button
                type="button"
                className={cn(
                  "px-3 py-1.5 text-xs font-medium",
                  span === "all" ? "bg-foreground text-background" : "text-muted-foreground",
                )}
                onClick={() => setSpan("all")}
              >
                All dates
              </button>
            </div>
          </div>
        }
      />

      <ProfitAndLossReport statement={statement} />

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
        description="Push an invoice to put it in the Web Connector queue. Mark entered if you typed one by hand, or retry if QB rejected it."
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
                          {job.code} · {job.name}
                        </Link>
                      ) : (
                        "Needs a job"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(invoiceTotal(invoice.id, crm.invoiceLines))}
                    </TableCell>
                    <TableCell className="text-right">
                      <QbQueueActions
                        kind="invoice"
                        id={invoice.id}
                        label={invoice.number}
                        status={invoice.qbStatus}
                        blocked={invoicePushBlocked({ invoice, job, lines: crm.invoiceLines.filter((line) => line.invoiceId === invoice.id) })}
                      />
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
        description="Push a receipt to post a check or credit card charge in QuickBooks. Mark entered if you typed one by hand."
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
                      <QbQueueActions
                        kind="expense"
                        id={expense.id}
                        label={expense.number}
                        status={expense.qbStatus}
                        blocked={expensePushBlocked(expense)}
                      />
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
        description="Push a deposit to receive it in QuickBooks against the same invoice. Push the invoice first. Mark entered if you typed one by hand."
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
                      <QbQueueActions
                        kind="payment"
                        id={payment.id}
                        label={invoice?.number ?? "Payment"}
                        status={payment.qbStatus}
                        blocked={paymentPushBlocked({
                          payment,
                          invoice,
                          job: payment.jobId ? crm.getJob(payment.jobId) : undefined,
                        })}
                      />
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

function QbQueueActions({
  kind,
  id,
  label,
  status,
  blocked,
}: {
  kind: "invoice" | "expense" | "payment";
  id: string;
  label: string;
  status: QbSyncStatus;
  blocked: string | null;
}) {
  const crm = useCrm();
  const [pending, setPending] = useState<"push" | "entered" | null>(null);

  async function pushToQuickBooks() {
    if (blocked) {
      toast.error(blocked);
      return;
    }
    setPending("push");
    try {
      const ok = await crm.setQbStatus(kind, id, "queued");
      if (ok) toast.success(`${label} is in the Web Connector queue.`);
    } finally {
      setPending(null);
    }
  }

  async function markEntered() {
    setPending("entered");
    try {
      await crm.setQbStatus(kind, id, "entered");
    } finally {
      setPending(null);
    }
  }

  async function retry() {
    setPending("push");
    try {
      const ok = await crm.setQbStatus(kind, id, "queued");
      if (ok) toast.success(`${label} is back in the Web Connector queue.`);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <QbStatusBadge status={status} />
      <Button
        nativeButton={false}
        size="sm"
        render={<Link href={`/accounting/approve/${kind}/${id}`} />}
      >
        Review
      </Button>
      {status === "error" ? (
        <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => void retry()}>
          Retry
        </Button>
      ) : status === "queued" || status === "returned" ? null : (
        <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => void pushToQuickBooks()}>
          Queue
        </Button>
      )}
      {status === "error" || status === "returned" ? null : (
        <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => void markEntered()}>
          Mark entered
        </Button>
      )}
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
