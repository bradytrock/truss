"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { InvoiceDocument } from "@/components/invoice-document";
import { ShareFrame, ShareLoading, ShareMissing, SharePdfButton } from "@/components/share-frame";
import { downloadInvoicePdf } from "@/lib/document-pdf";
import { useCrm } from "@/lib/crm-store";
import { documentProjectManager, letterheadCompanyForRecord } from "@/lib/document-owner";
import { derivedInvoiceStatus } from "@/lib/money";
import { parseSharedInvoice, type SharedInvoicePayload } from "@/lib/share";

export default function SharedInvoicePage() {
  const { token } = useParams<{ token: string }>();
  const crm = useCrm();
  const [remote, setRemote] = useState<SharedInvoicePayload | null>(null);
  const [remoteState, setRemoteState] = useState<"idle" | "loading" | "missing">("idle");

  const fromStore = useMemo(
    () => crm.invoices.find((invoice) => invoice.shareToken === token),
    [crm.invoices, token]
  );

  useEffect(() => {
    if (!crm.hydrated) return;
    if (fromStore) {
      setRemote(null);
      setRemoteState("idle");
      return;
    }
    let cancelled = false;
    setRemoteState("loading");
    void fetch(`/api/share/invoice/${encodeURIComponent(token)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (cancelled) return;
        const parsed = parseSharedInvoice(data);
        if (!parsed) {
          setRemote(null);
          setRemoteState("missing");
          return;
        }
        setRemote(parsed);
        setRemoteState("idle");
      })
      .catch(() => {
        if (!cancelled) {
          setRemote(null);
          setRemoteState("missing");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [crm.hydrated, fromStore, token]);

  if (!crm.hydrated || (remoteState === "loading" && !fromStore && !remote)) {
    return <ShareLoading />;
  }

  if (fromStore) {
    const lines = crm.invoiceLines
      .filter((line) => line.invoiceId === fromStore.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const payments = crm.payments.filter((payment) => payment.invoiceId === fromStore.id);
    const status = derivedInvoiceStatus(fromStore, crm.invoiceLines, crm.payments);
    const customer = crm.customerName(fromStore);
    const job = fromStore.jobId ? crm.jobs.find((item) => item.id === fromStore.jobId) : undefined;
    const linkedEstimate = fromStore.estimateId
      ? crm.estimates.find((item) => item.id === fromStore.estimateId)
      : undefined;
    const opportunityId = job?.opportunityId || linkedEstimate?.opportunityId;
    const opportunity = opportunityId
      ? crm.opportunities.find((item) => item.id === opportunityId)
      : undefined;
    const letterhead = letterheadCompanyForRecord({
      company: crm.company,
      job,
      opportunity,
      staff: crm.staff,
      fallbackStaffId: crm.user.staffId,
      inBook: true,
    });
    const projectManager = documentProjectManager({
      job,
      opportunity,
      staff: crm.staff,
      fallbackStaffId: crm.user.staffId,
      companyPhone: letterhead.phone,
    });
    return (
      <ShareFrame
        actions={
          <SharePdfButton
            disabled={lines.length === 0}
            onClick={() =>
              void downloadInvoicePdf({
                invoice: fromStore,
                lines,
                payments,
                company: letterhead,
                customer,
                projectManager,
              }).catch(() => toast.error("Could not build the PDF."))
            }
          />
        }
      >
        <InvoiceDocument
          company={crm.company}
          invoice={fromStore}
          lines={lines}
          payments={payments}
          customer={customer}
          status={status}
          showStatus={false}
        />
      </ShareFrame>
    );
  }

  if (!remote || remoteState === "missing") {
    return <ShareMissing kind="invoice" />;
  }

  return (
    <ShareFrame
      actions={
        <SharePdfButton
          disabled={remote.lines.length === 0}
          onClick={() =>
            void downloadInvoicePdf({
              invoice: remote.invoice,
              lines: remote.lines,
              payments: remote.payments,
              company: remote.company,
              customer: remote.customer,
              projectManager: remote.projectManager,
            }).catch(() => toast.error("Could not build the PDF."))
          }
        />
      }
    >
      <InvoiceDocument
        company={remote.company}
        invoice={remote.invoice}
        lines={remote.lines}
        payments={remote.payments}
        customer={remote.customer}
        status={remote.invoice.status}
        showStatus={false}
        projectManager={remote.projectManager}
      />
    </ShareFrame>
  );
}
