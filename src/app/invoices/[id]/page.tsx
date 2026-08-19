"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RecordPaymentDialog } from "@/components/create-ops-dialogs";
import { RecordProperty } from "@/components/app-shell";
import { EmptyState, LoadingScreen } from "@/components/page-chrome";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { useCrm } from "@/lib/crm-store";
import { formatCurrencyFull, formatDate, formatMoney } from "@/lib/format";
import {
  derivedInvoiceStatus,
  invoiceBalance,
  invoiceTotal,
  lineAmount,
  paidOnInvoice,
} from "@/lib/money";

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const crm = useCrm();
  const invoice = crm.getInvoice(id);
  const [payOpen, setPayOpen] = useState(false);

  if (!crm.hydrated) return <LoadingScreen />;
  if (!invoice) {
    return (
      <EmptyState
        icon={<span className="text-sm font-medium">?</span>}
        title="Invoice not found"
        description="It may have been removed when demo data was reset."
        action={
          <Button nativeButton={false} render={<Link href="/invoices" />}>
            Back to invoices
          </Button>
        }
      />
    );
  }

  const client = crm.getClient(invoice.clientId);
  const job = invoice.jobId ? crm.getJob(invoice.jobId) : undefined;
  const estimate = invoice.estimateId ? crm.getEstimate(invoice.estimateId) : undefined;
  const lines = crm.invoiceLines
    .filter((line) => line.invoiceId === invoice.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const payments = crm.payments.filter((payment) => payment.invoiceId === invoice.id);
  const status = derivedInvoiceStatus(invoice, crm.invoiceLines, crm.payments);
  const total = invoiceTotal(invoice.id, crm.invoiceLines);
  const paid = paidOnInvoice(invoice.id, crm.payments);
  const balance = invoiceBalance(invoice.id, crm.invoiceLines, crm.payments);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {invoice.number}
          </p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">
            {invoice.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <InvoiceStatusBadge status={status} />
            <span className="text-sm text-muted-foreground">
              {client ? (
                <Link href={`/clients/${client.id}`} className="hover:underline">
                  {client.name}
                </Link>
              ) : (
                "Unknown client"
              )}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {invoice.status === "draft" ? (
            <Button
              onClick={() => {
                void crm.sendInvoice(invoice.id);
                toast.success("Invoice marked sent.");
              }}
            >
              Mark sent
            </Button>
          ) : null}
          {status !== "void" && status !== "paid" ? (
            <Button variant={invoice.status === "draft" ? "outline" : "default"} onClick={() => setPayOpen(true)}>
              Record payment
            </Button>
          ) : null}
          {status !== "void" && status !== "paid" ? (
            <Button
              variant="outline"
              onClick={() => {
                void crm.voidInvoice(invoice.id);
                toast.message("Invoice voided.");
              }}
            >
              Void
            </Button>
          ) : null}
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <p className="text-xs text-muted-foreground">Total</p>
            <CardTitle className="text-xl tabular-nums">{formatCurrencyFull(total)}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <p className="text-xs text-muted-foreground">Paid</p>
            <CardTitle className="text-xl tabular-nums">{formatCurrencyFull(paid)}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <p className="text-xs text-muted-foreground">Balance</p>
            <CardTitle className="text-xl tabular-nums">{formatCurrencyFull(balance)}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Line items</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {lines.length === 0 ? (
                <p className="px-4 py-8 text-sm text-muted-foreground">
                  No lines on this invoice. Convert an estimate to copy the schedule of values.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">Unit cost</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.description}</TableCell>
                        <TableCell className="tabular-nums">{line.quantity}</TableCell>
                        <TableCell>{line.unit}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(line.unitCost)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(lineAmount(line))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={4} className="font-medium">
                        Total
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatCurrencyFull(total)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Payments</CardTitle>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">No payments recorded yet.</p>
              ) : (
                <ul className="divide-y">
                  {payments.map((payment) => (
                    <li key={payment.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0">
                      <div>
                        <p className="text-sm font-medium tabular-nums">{formatMoney(payment.amount)}</p>
                        <p className="text-xs text-muted-foreground">
                          {payment.method} · {formatDate(payment.paidAt)}
                          {payment.reference ? ` · ${payment.reference}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Billing</CardTitle>
          </CardHeader>
          <CardContent>
            <RecordProperty label="Issued">{formatDate(invoice.issuedAt)}</RecordProperty>
            <RecordProperty label="Due">{formatDate(invoice.dueAt)}</RecordProperty>
            <RecordProperty label="Job">
              {job ? (
                <Link href={`/jobs/${job.id}`} className="hover:underline">
                  {job.name}
                </Link>
              ) : (
                "—"
              )}
            </RecordProperty>
            <RecordProperty label="From estimate">
              {estimate ? (
                <Link href={`/estimates/${estimate.id}`} className="hover:underline">
                  {estimate.number}
                </Link>
              ) : (
                "—"
              )}
            </RecordProperty>
            {invoice.notes ? <RecordProperty label="Notes">{invoice.notes}</RecordProperty> : null}
          </CardContent>
        </Card>
      </div>

      <RecordPaymentDialog open={payOpen} onOpenChange={setPayOpen} invoiceId={invoice.id} />
    </div>
  );
}
