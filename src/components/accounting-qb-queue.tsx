"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
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
import { QbStatusBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatDate, formatMoney } from "@/lib/format";
import { invoiceTotal } from "@/lib/money";
import { EXPENSE_ACCOUNT_LABELS, type QbSyncStatus } from "@/lib/types";
import { expensePushBlocked, invoicePushBlocked, paymentPushBlocked } from "@/lib/qbwc/work";

export function AccountingSyncQueues() {
  const crm = useCrm();
  const invoices = crm.invoices.filter(
    (invoice) => invoice.qbStatus !== "entered" && invoice.status !== "draft" && invoice.status !== "void",
  );
  const expenses = crm.expenses.filter((expense) => expense.qbStatus !== "entered");
  const payments = crm.payments.filter((payment) => payment.qbStatus !== "entered");

  return (
    <div className="space-y-4">
      <QueueCard
        title="Invoices in the connector"
        description="Approve from Invoice review. Queue here only if you already checked the file."
        empty="No invoices waiting on QuickBooks."
      >
        {invoices.length === 0 ? null : (
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
              {invoices.map((invoice) => {
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
                        blocked={invoicePushBlocked({
                          invoice,
                          job,
                          lines: crm.invoiceLines.filter((line) => line.invoiceId === invoice.id),
                        })}
                        reviewHref={`/accounting?tab=review&invoice=${invoice.id}`}
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
        description="Receipts still waiting to post as a check or credit card charge on Customer:Job."
        empty="No expenses waiting on QuickBooks."
      >
        {expenses.length === 0 ? null : (
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
              {expenses.map((expense) => {
                const job = expense.jobId ? crm.getJob(expense.jobId) : undefined;
                return (
                  <TableRow key={expense.id}>
                    <TableCell>
                      {expense.receiptUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <a href={expense.receiptUrl} target="_blank" rel="noreferrer">
                          <img src={expense.receiptUrl} alt="" className="size-12 border object-cover" />
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{expense.vendor}</p>
                      <p className="text-xs text-muted-foreground">
                        {expense.number} · {formatDate(expense.incurredAt)}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">
                      <p>{job?.name ?? "Overhead"}</p>
                      <p className="text-xs text-muted-foreground">{EXPENSE_ACCOUNT_LABELS[expense.account]}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(expense.amount)}</TableCell>
                    <TableCell className="text-right">
                      <QbQueueActions
                        kind="expense"
                        id={expense.id}
                        label={expense.number}
                        status={expense.qbStatus}
                        blocked={expensePushBlocked({ expense, job })}
                        reviewHref={`/accounting/approve/expense/${expense.id}`}
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
        description="Deposits waiting to receive against the same invoice in QuickBooks."
        empty="No deposits waiting on QuickBooks."
      >
        {payments.length === 0 ? null : (
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
              {payments.map((payment) => {
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
                        reviewHref={`/accounting/approve/payment/${payment.id}`}
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
  reviewHref,
}: {
  kind: "invoice" | "expense" | "payment";
  id: string;
  label: string;
  status: QbSyncStatus;
  blocked: string | null;
  reviewHref: string;
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

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <QbStatusBadge status={status} />
      <Button nativeButton={false} size="sm" render={<Link href={reviewHref} />}>
        Review
      </Button>
      {status === "error" ? (
        <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => void pushToQuickBooks()}>
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
    <Card className="rounded-sm border-[#c9c9c9] shadow-[0_2px_2px_rgba(0,0,0,0.05)]">
      <CardHeader className="border-b border-[#c9c9c9] bg-[#f3f3f3]">
        <CardTitle className="font-sans text-sm font-semibold text-[#181818]">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isEmpty ? <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p> : children}
      </CardContent>
    </Card>
  );
}
