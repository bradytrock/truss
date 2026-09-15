"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, CirclePause, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useCrm } from "@/lib/crm-store";
import {
  INVOICE_REVIEW_FILTERS,
  INVOICE_REVIEW_LABELS,
  invoiceBlockedReason,
  invoiceDueLabel,
  invoiceReviewAmount,
  invoiceReviewStatus,
  parseInvoiceReviewFilter,
  reviewableInvoices,
  type InvoiceReviewFilter,
  type InvoiceReviewStatus,
} from "@/lib/accounting-books";
import { formatMoney } from "@/lib/format";
import { invoiceTotal, lineAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Invoice } from "@/lib/types";

const STATUS_CLASS: Record<InvoiceReviewStatus, string> = {
  ready: "bg-[#e3f1e6] text-[#2f7a45]",
  needs_review: "bg-[#fbefd9] text-[#9a5b0c]",
  held: "bg-[#ecebe8] text-[#55524d]",
  queued: "bg-[#e4edfb] text-[#13295b]",
};

export function AccountingInvoiceReview({
  selectedId,
  onSelect,
}: {
  selectedId?: string | null;
  onSelect: (invoiceId: string | null) => void;
}) {
  const crm = useCrm();
  const [filter, setFilter] = useState<InvoiceReviewFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);

  const rows = useMemo(() => {
    return reviewableInvoices(crm.invoices).map((invoice) => {
      const job = invoice.jobId ? crm.getJob(invoice.jobId) : undefined;
      const lines = crm.invoiceLines.filter((line) => line.invoiceId === invoice.id);
      const blocked = invoiceBlockedReason({ invoice, job, lines });
      const status = invoiceReviewStatus(invoice, blocked);
      return {
        invoice,
        job,
        lines,
        blocked,
        status,
        amount: invoiceTotal(invoice.id, crm.invoiceLines),
        customer: crm.customerName(invoice),
      };
    });
  }, [crm]);

  const visible = rows.filter((row) =>
    filter === "all" ? row.status !== "queued" : row.status === filter,
  );
  const pendingRows = rows.filter((row) => row.status !== "queued");
  const open =
    rows.find((row) => row.invoice.id === selectedId) ??
    visible[0] ??
    rows[0] ??
    null;

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function approve(ids: string[]) {
    const ok: string[] = [];
    const skip: string[] = [];
    setPending(true);
    try {
      for (const id of ids) {
        const row = rows.find((item) => item.invoice.id === id);
        if (!row || row.status === "held" || row.status === "needs_review") {
          skip.push(id);
          continue;
        }
        const done = await crm.setQbStatus("invoice", id, "queued");
        if (done) ok.push(id);
        else skip.push(id);
      }
      setSelected(new Set());
      if (ok.length) {
        toast.success(
          `${ok.length} sent to the Web Connector queue${skip.length ? ` — ${skip.length} skipped` : ""}.`,
        );
      } else {
        toast.error("Nothing sent. Fix or release the selected invoices first.");
      }
    } finally {
      setPending(false);
    }
  }

  async function hold(invoice: Invoice) {
    const next = invoice.qbStatus === "returned" ? "not_in_qb" : "returned";
    const ok = await crm.setQbStatus("invoice", invoice.id, next);
    if (ok) toast.success(next === "returned" ? `${invoice.number} is on hold.` : `${invoice.number} released.`);
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">Invoice review</p>
        <p className="text-sm text-[#706e6b]">
          Approve invoices before they go to QuickBooks through the Web Connector. Receipts have their
          own Expense review tab.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,1fr)]">
        <section className="overflow-hidden rounded-sm border border-[#c9c9c9] bg-white shadow-[0_2px_2px_rgba(0,0,0,0.05)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#c9c9c9] bg-white px-3 py-2">
            <div className="flex flex-wrap gap-1">
              {INVOICE_REVIEW_FILTERS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(parseInvoiceReviewFilter(item))}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium",
                    filter === item
                      ? "border-[#13295b] bg-[#13295b] text-white"
                      : "border-[#dad7d1] bg-white text-[#55524d]",
                  )}
                >
                  {item === "all" ? "All" : INVOICE_REVIEW_LABELS[item]}
                </button>
              ))}
            </div>
            <span className="ml-auto text-xs text-[#86827b]">{selected.size} selected</span>
            <Button
              size="sm"
              disabled={pending || selected.size === 0}
              onClick={() => void approve([...selected])}
            >
              <Send data-icon="inline-start" />
              Approve and send
            </Button>
          </div>

          {visible.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-[#706e6b]">
              <CheckCircle2 className="mx-auto mb-2 size-7 text-[#2f7a45]" />
              Every invoice in this view is approved and queued.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="border-b border-[#c9c9c9] bg-[#f3f3f3] text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">
                  <tr>
                    <th className="w-10 px-3 py-2">
                      <Checkbox
                        checked={visible.length > 0 && visible.every((row) => selected.has(row.invoice.id))}
                        onCheckedChange={(value) => {
                          setSelected((current) => {
                            const next = new Set(current);
                            for (const row of visible) {
                              if (value) next.add(row.invoice.id);
                              else next.delete(row.invoice.id);
                            }
                            return next;
                          });
                        }}
                        aria-label="Select all"
                      />
                    </th>
                    <th className="px-3 py-2">Invoice</th>
                    <th className="px-3 py-2">Customer and job</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e5e5e5]">
                  {visible.map((row) => (
                    <tr
                      key={row.invoice.id}
                      className={cn(
                        "cursor-pointer hover:bg-[#faf9f7]",
                        open?.invoice.id === row.invoice.id && "bg-[#e4edfb]",
                      )}
                      onClick={() => onSelect(row.invoice.id)}
                    >
                      <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(row.invoice.id)}
                          onCheckedChange={(value) => toggle(row.invoice.id, Boolean(value))}
                          aria-label={`Select ${row.invoice.number}`}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-[#181818]">{row.invoice.number}</p>
                        <p className="text-xs text-[#86827b]">{invoiceDueLabel(row.invoice)}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p>{row.customer || "No customer"}</p>
                        <p className="text-xs text-[#86827b]">{row.job?.name || row.invoice.name || "No job"}</p>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(row.amount)}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CLASS[row.status])}>
                          {INVOICE_REVIEW_LABELS[row.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-[#e8e5df] px-3 py-2 text-xs text-[#86827b]">
            {pendingRows.length} awaiting approval · {formatMoney(invoiceReviewAmount(pendingRows.map((row) => row.invoice), crm.invoiceLines))}
          </p>
        </section>

        <aside className="overflow-hidden rounded-sm border border-[#c9c9c9] bg-white shadow-[0_2px_2px_rgba(0,0,0,0.05)]">
          {!open ? (
            <p className="px-4 py-12 text-center text-sm text-[#706e6b]">Select an invoice to review it.</p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-[#c9c9c9] bg-[#f3f3f3] px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#181818]">{open.invoice.number}</h3>
                  <p className="mt-0.5 text-xs text-[#706e6b]">
                    {open.customer || "No customer"}
                    {open.job ? ` — ${open.job.name}` : ""}
                  </p>
                </div>
                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CLASS[open.status])}>
                  {INVOICE_REVIEW_LABELS[open.status]}
                </span>
              </div>
              <div className="space-y-4 px-4 py-4">
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
                  <dt className="text-[#706e6b]">Job</dt>
                  <dd className="text-right">
                    {open.job ? (
                      <Link href={`/jobs?job=${open.job.id}`} className="text-[#0176d3] hover:underline">
                        {open.job.code || open.job.name}
                      </Link>
                    ) : (
                      "Assign a job"
                    )}
                  </dd>
                  <dt className="text-[#706e6b]">Customer</dt>
                  <dd className="text-right">{open.customer || "—"}</dd>
                  <dt className="text-[#706e6b]">Sales rep</dt>
                  <dd className="text-right">{open.job?.salesRep.trim() || "Unassigned"}</dd>
                  <dt className="text-[#706e6b]">QuickBooks</dt>
                  <dd className="text-right">{open.invoice.qbStatus.replaceAll("_", " ")}</dd>
                </dl>

                <table className="w-full text-sm">
                  <tbody>
                    {open.lines.map((line) => (
                      <tr key={line.id} className="border-b border-dashed border-[#e8e5df]">
                        <td className="py-2">
                          {line.description || "Line"}
                          <div className="text-xs text-[#86827b]">
                            {line.quantity} {line.unit} · {formatMoney(line.unitCost)}
                          </div>
                        </td>
                        <td className="py-2 text-right tabular-nums">{formatMoney(lineAmount(line))}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="pt-2 font-semibold">Total</td>
                      <td className="pt-2 text-right font-semibold tabular-nums">{formatMoney(open.amount)}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="space-y-2">
                  <CheckRow ok={Boolean(open.job)} label={open.job ? "Assigned to a job" : "Assign this invoice to a job"} />
                  <CheckRow
                    ok={open.lines.length > 0}
                    label={open.lines.length > 0 ? "Line items are on the invoice" : "Add line items before QuickBooks"}
                  />
                  <CheckRow
                    ok={!open.blocked}
                    warn={open.status === "held"}
                    label={
                      open.status === "held"
                        ? "Held — release before sending"
                        : open.blocked || "Ready to send to QuickBooks"
                    }
                  />
                </div>

                {open.status === "queued" ? (
                  <p className="text-sm text-[#706e6b]">Queued for the next Web Connector poll.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={pending || open.status === "held" || open.status === "needs_review"}
                      onClick={() => void approve([open.invoice.id])}
                    >
                      Approve and send
                    </Button>
                    <Button variant="outline" onClick={() => void hold(open.invoice)}>
                      {open.status === "held" ? "Release hold" : "Hold"}
                    </Button>
                    <Button nativeButton={false} variant="outline" render={<Link href={`/invoices/${open.invoice.id}`} />}>
                      Edit invoice
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function CheckRow({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {warn ? (
        <CirclePause className="mt-0.5 size-4 text-[#9a5b0c]" />
      ) : ok ? (
        <CheckCircle2 className="mt-0.5 size-4 text-[#2f7a45]" />
      ) : (
        <CircleAlert className="mt-0.5 size-4 text-[#b3261e]" />
      )}
      <span>{label}</span>
    </div>
  );
}

export function InvoiceReviewCountBadge({ className }: { className?: string }) {
  const crm = useCrm();
  const count = reviewableInvoices(crm.invoices).filter((invoice) => invoice.qbStatus !== "queued").length;
  if (!count) return null;
  return (
    <Badge variant="secondary" className={cn("ml-1 h-5 min-w-5 px-1.5 text-[11px]", className)}>
      {count}
    </Badge>
  );
}
