"use client";

import { CompanyLetterhead } from "@/components/company-letterhead";
import { InvoiceStatusBadge } from "@/components/status-badge";
import { useCrmOptional } from "@/lib/crm-store";
import { letterheadCompanyForRecord } from "@/lib/document-owner";
import type { CompanySettings, Invoice, InvoiceLine, InvoiceStatus, Payment } from "@/lib/types";
import { formatDate, formatMoney } from "@/lib/format";
import { invoiceBalance, invoiceTotal, lineAmount, paidOnInvoice } from "@/lib/money";

export function InvoiceDocument({
  invoice,
  lines,
  payments,
  customer,
  company,
  status,
  showStatus = true,
}: {
  invoice: Invoice;
  lines: InvoiceLine[];
  payments: Payment[];
  customer: string;
  company?: CompanySettings;
  status: InvoiceStatus;
  showStatus?: boolean;
}) {
  const sorted = [...lines].sort((a, b) => a.sortOrder - b.sortOrder);
  const total = invoiceTotal(invoice.id, lines);
  const paid = paidOnInvoice(invoice.id, payments);
  const balance = invoiceBalance(invoice.id, lines, payments);
  const crm = useCrmOptional();
  const job = invoice.jobId && crm ? crm.jobs.find((item) => item.id === invoice.jobId) : undefined;
  const linkedEstimate =
    invoice.estimateId && crm ? crm.estimates.find((item) => item.id === invoice.estimateId) : undefined;
  const opportunityId = job?.opportunityId || linkedEstimate?.opportunityId;
  const opportunity =
    opportunityId && crm ? crm.opportunities.find((item) => item.id === opportunityId) : undefined;
  const letterhead = letterheadCompanyForRecord({
    company: company ?? crm?.company,
    job,
    opportunity,
    staff: crm?.staff ?? [],
    fallbackStaffId: crm?.user.staffId,
    inBook: Boolean(crm?.invoices.some((item) => item.id === invoice.id)),
  });

  return (
    <div className="space-y-6 rounded-md border bg-card p-5 sm:p-7">
      <CompanyLetterhead company={letterhead} />
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {invoice.number}
          </p>
          <h2 className="font-heading mt-1 text-2xl font-medium text-balance">{invoice.name}</h2>
          <p className="mt-2 text-sm text-muted-foreground">Bill to {customer}</p>
        </div>
        <div className="text-sm sm:text-right">
          {showStatus ? <InvoiceStatusBadge status={status} /> : null}
          <p className={showStatus ? "mt-2 text-muted-foreground" : "text-muted-foreground"}>
            Issued {formatDate(invoice.issuedAt)}
          </p>
          <p className="text-muted-foreground">Due {formatDate(invoice.dueAt)}</p>
        </div>
      </div>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No line items on this invoice.</p>
      ) : (
        <ul className="divide-y border-y">
          {sorted.map((line) => (
            <li key={line.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">{line.description}</p>
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {line.quantity} {line.unit} × {formatMoney(line.unitCost)}
                </p>
              </div>
              <p className="shrink-0 tabular-nums">{formatMoney(lineAmount(line))}</p>
            </li>
          ))}
        </ul>
      )}
      <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Total</dt>
          <dd className="tabular-nums">{formatMoney(total)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Paid</dt>
          <dd className="tabular-nums">{formatMoney(paid)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t pt-2 font-medium">
          <dt>Balance due</dt>
          <dd className="tabular-nums">{formatMoney(balance)}</dd>
        </div>
      </dl>
    </div>
  );
}
