"use client";

import { InvoiceStatusBadge } from "@/components/status-badge";
import { useCrmOptional } from "@/lib/crm-store";
import { documentProjectManager, letterheadCompanyForRecord, type ProjectManagerContact } from "@/lib/document-owner";
import type { CompanySettings, Invoice, InvoiceLine, InvoiceStatus, Payment } from "@/lib/types";
import { invoiceTermsValues, liveInvoiceTerms } from "@/lib/document-terms";
import { DocumentNotesBlock } from "@/components/document-notes";
import { DocumentTermsFields } from "@/components/document-terms-fields";
import { formatMoney } from "@/lib/format";
import { FormattedLineText } from "@/components/formatted-line-text";
import { invoiceBalance, invoiceTotal, lineAmount, paidOnInvoice } from "@/lib/money";
import { paperInvoiceMeta, paperQtyLabel, paperSiteTitle } from "@/lib/document-paper";
import {
  PaperCoverHeader,
  PaperFooter,
  PaperMetaRow,
  PaperPartyCards,
  PaperSectionLabel,
  PaperSheet,
  PaperSiteTitle,
  PaperTableHead,
  PaperTableRow,
  PaperTermsColumns,
  PaperTotals,
  paperManagerCard,
} from "@/components/document-paper-chrome";

export function InvoiceDocument({
  invoice,
  lines,
  payments,
  customer,
  company,
  status,
  showStatus = true,
  projectManager,
  onTermsChange,
}: {
  invoice: Invoice;
  lines: InvoiceLine[];
  payments: Payment[];
  customer: string;
  company?: CompanySettings;
  status: InvoiceStatus;
  showStatus?: boolean;
  projectManager?: ProjectManagerContact | null;
  onTermsChange?: (terms: string) => void;
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
  const manager =
    projectManager ??
    documentProjectManager({
      job,
      opportunity,
      staff: crm?.staff ?? [],
      fallbackStaffId: crm?.user.staffId,
      companyPhone: letterhead.phone,
    });
  const terms = liveInvoiceTerms({
    invoice,
    companyDefault: letterhead.defaultInvoiceTerms,
  });
  const site = paperSiteTitle({
    street: job?.street,
    city: job?.city,
    state: job?.state,
    postalCode: job?.postalCode,
    name: invoice.name,
    kindTitle: "Invoice",
  });

  return (
    <PaperSheet className="space-y-6 p-5 sm:p-7">
      <PaperCoverHeader company={letterhead} kind="invoice" number={invoice.number} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PaperSiteTitle title={site.title} locality={site.locality} />
        {showStatus ? <InvoiceStatusBadge status={status} /> : null}
      </div>
      <PaperMetaRow
        items={paperInvoiceMeta({
          number: invoice.number,
          issuedAt: invoice.issuedAt,
          dueAt: invoice.dueAt,
          jobCode: job?.code,
        })}
      />
      <PaperPartyCards
        left={{ label: "Bill to", name: customer, lines: [site.locality].filter(Boolean) }}
        right={paperManagerCard(manager)}
      />
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No line items on this invoice.</p>
      ) : (
        <div className="overflow-x-auto">
          <PaperTableHead />
          <div className="divide-y">
            {sorted.map((line) => (
              <PaperTableRow
                key={line.id}
                heading={
                  <FormattedLineText
                    text={line.description}
                    className="text-sm text-muted-foreground [&_p:first-child]:font-medium [&_p:first-child]:text-foreground"
                  />
                }
                qty={paperQtyLabel(line.quantity)}
                unit={line.unit || ""}
                rate={formatMoney(line.unitCost)}
                amount={formatMoney(lineAmount(line))}
              />
            ))}
          </div>
        </div>
      )}
      <PaperTotals
        rows={[
          { label: "Total", value: formatMoney(total) },
          { label: "Paid", value: formatMoney(paid) },
        ]}
        pill={{ label: "BALANCE", value: formatMoney(balance) }}
      />
      <DocumentNotesBlock notes={invoice.notes} />
      <div className="break-inside-auto space-y-2">
        <PaperSectionLabel>Payment terms</PaperSectionLabel>
        <PaperTermsColumns>
          <DocumentTermsFields
            value={terms}
            values={invoiceTermsValues({
              invoice,
              lines,
              payments,
              customer,
              company: letterhead,
            })}
            disabled={!onTermsChange}
            emptyLabel="No payment terms on this invoice."
            hint=""
            onCommit={onTermsChange ?? (() => {})}
          />
        </PaperTermsColumns>
      </div>
      <PaperFooter company={letterhead} />
    </PaperSheet>
  );
}
