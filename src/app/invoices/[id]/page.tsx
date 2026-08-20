"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecordPaymentDialog } from "@/components/create-ops-dialogs";
import { RecordProperty } from "@/components/app-shell";
import { InvoiceDocument } from "@/components/invoice-document";
import { EmptyState, LoadingScreen } from "@/components/page-chrome";
import { ShareLinkDialog } from "@/components/share-link-dialog";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { downloadInvoicePdf } from "@/lib/document-pdf";
import { useCrm } from "@/lib/crm-store";
import { formatCurrencyFull, formatDate, formatMoney } from "@/lib/format";
import { shareUrl } from "@/lib/share";
import type { Invoice } from "@/lib/types";
import {
  derivedInvoiceStatus,
  invoiceBalance,
  invoiceTotal,
  paidOnInvoice,
} from "@/lib/money";

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const crm = useCrm();
  const invoice = crm.getInvoice(id);
  const [payOpen, setPayOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [pending, setPending] = useState(false);

  if (!crm.hydrated) return <LoadingScreen />;
  if (!invoice) {
    return (
      <EmptyState
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

  const record: Invoice = invoice;
  const job = record.jobId ? crm.getJob(record.jobId) : undefined;
  const estimate = record.estimateId ? crm.getEstimate(record.estimateId) : undefined;
  const lines = crm.invoiceLines
    .filter((line) => line.invoiceId === record.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const payments = crm.payments.filter((payment) => payment.invoiceId === record.id);
  const status = derivedInvoiceStatus(record, crm.invoiceLines, crm.payments);
  const total = invoiceTotal(record.id, crm.invoiceLines);
  const paid = paidOnInvoice(record.id, crm.payments);
  const balance = invoiceBalance(record.id, crm.invoiceLines, crm.payments);
  const customer = crm.customerName(record);

  function downloadPdf() {
    if (lines.length === 0) {
      toast.error("Add at least one line before generating a PDF.");
      return;
    }
    return downloadInvoicePdf({
      invoice: record,
      lines,
      payments,
      company: crm.company,
      customer,
    });
  }

  async function openShare(markSent: boolean) {
    setPending(true);
    try {
      if (markSent) await crm.sendInvoice(record.id);
      else await crm.ensureInvoiceShareToken(record.id);
      setShareOpen(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {record.number}
          </p>
          <h1 className="font-heading text-[1.85rem] leading-[1.1] font-medium text-balance">
            {record.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <InvoiceStatusBadge status={status} />
            <span className="text-sm text-muted-foreground">{customer}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={pending || lines.length === 0} onClick={() => void downloadPdf()}>
            <Download />
            PDF
          </Button>
          {record.status === "draft" ? (
            <Button disabled={pending} onClick={() => void openShare(true)}>
              Send
            </Button>
          ) : (
            <Button variant="outline" disabled={pending} onClick={() => void openShare(false)}>
              Share
            </Button>
          )}
          {status !== "void" && status !== "paid" ? (
            <Button variant={record.status === "draft" ? "outline" : "default"} onClick={() => setPayOpen(true)}>
              Record payment
            </Button>
          ) : null}
          {status !== "void" && status !== "paid" ? (
            <Button
              variant="outline"
              onClick={() => {
                void crm.voidInvoice(record.id);
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
          <InvoiceDocument
            invoice={record}
            lines={lines}
            payments={payments}
            customer={customer}
            company={crm.company}
            status={status}
          />

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
            <RecordProperty label="Issued">{formatDate(record.issuedAt)}</RecordProperty>
            <RecordProperty label="Due">{formatDate(record.dueAt)}</RecordProperty>
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
            {record.notes ? <RecordProperty label="Notes">{record.notes}</RecordProperty> : null}
          </CardContent>
        </Card>
      </div>

      <RecordPaymentDialog open={payOpen} onOpenChange={setPayOpen} invoiceId={record.id} />
      <ShareLinkDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        title={`Share ${record.number}`}
        description="Copy this link for the homeowner. They can open the invoice and download a PDF — no login required."
        url={record.shareToken ? shareUrl("i", record.shareToken) : ""}
        onDownloadPdf={downloadPdf}
      />
    </div>
  );
}
