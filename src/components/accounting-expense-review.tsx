"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, CirclePause, FileText, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ExpenseFields } from "@/components/qb-review-fields";
import { useCrm } from "@/lib/crm-store";
import {
  INVOICE_REVIEW_FILTERS,
  INVOICE_REVIEW_LABELS,
  expenseBlockedReason,
  expenseQbPreview,
  expenseReviewStatus,
  parseInvoiceReviewFilter,
  reviewableExpenses,
  type InvoiceReviewFilter,
  type InvoiceReviewStatus,
} from "@/lib/accounting-books";
import { formatDate, formatMoney } from "@/lib/format";
import { isReceiptPdf } from "@/lib/qb-review";
import { cn } from "@/lib/utils";
import type { Expense } from "@/lib/types";

const STATUS_CLASS: Record<InvoiceReviewStatus, string> = {
  ready: "bg-[#e3f1e6] text-[#2f7a45]",
  needs_review: "bg-[#fbefd9] text-[#9a5b0c]",
  held: "bg-[#ecebe8] text-[#55524d]",
  queued: "bg-[#e4edfb] text-[#13295b]",
};

export function AccountingExpenseReview({
  selectedId,
  onSelect,
}: {
  selectedId?: string | null;
  onSelect: (expenseId: string | null) => void;
}) {
  const crm = useCrm();
  const [filter, setFilter] = useState<InvoiceReviewFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [accounts, setAccounts] = useState<{ bankAccount?: string; ccAccount?: string }>({});

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/qbwc/setup")
      .then((response) => response.json())
      .then((data: { bankAccount?: string; ccAccount?: string }) => {
        if (!cancelled) setAccounts({ bankAccount: data.bankAccount, ccAccount: data.ccAccount });
      })
      .catch(() => {
        if (!cancelled) setAccounts({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    return reviewableExpenses(crm.expenses).map((expense) => {
      const job = expense.jobId ? crm.getJob(expense.jobId) : undefined;
      const blocked = expenseBlockedReason({ expense, job });
      const status = expenseReviewStatus(expense, blocked);
      const customer = job
        ? crm.customerName({
            jobId: job.id,
            clientId: job.clientId,
            primaryContactId: job.primaryContactId,
            opportunityId: job.opportunityId,
          })
        : "";
      return {
        expense,
        job,
        blocked,
        status,
        customer,
        preview: expenseQbPreview(expense, job, customer, accounts),
      };
    });
  }, [accounts, crm]);

  const visible = rows.filter((row) =>
    filter === "all" ? row.status !== "queued" : row.status === filter,
  );
  const pendingRows = rows.filter((row) => row.status !== "queued");
  const open =
    rows.find((row) => row.expense.id === selectedId) ??
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
        const row = rows.find((item) => item.expense.id === id);
        if (!row || row.status === "held" || row.status === "needs_review") {
          skip.push(id);
          continue;
        }
        const done = await crm.setQbStatus("expense", id, "queued");
        if (done) ok.push(id);
        else skip.push(id);
      }
      setSelected(new Set());
      if (ok.length) {
        toast.success(
          `${ok.length} sent to the Web Connector queue${skip.length ? ` — ${skip.length} skipped` : ""}.`,
        );
      } else {
        toast.error("Nothing sent. Fix or release the selected expenses first.");
      }
    } finally {
      setPending(false);
    }
  }

  async function hold(expense: Expense) {
    const next = expense.qbStatus === "returned" ? "not_in_qb" : "returned";
    const ok = await crm.setQbStatus("expense", expense.id, next);
    if (ok) toast.success(next === "returned" ? `${expense.number} is on hold.` : `${expense.number} released.`);
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">Expense review</p>
        <p className="text-sm text-[#706e6b]">
          Compare the receipt to the fields QuickBooks will get, then approve the check or credit card charge.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(20rem,0.95fr)_minmax(0,1.7fr)]">
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
              Every expense in this view is approved and queued.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="border-b border-[#c9c9c9] bg-[#f3f3f3] text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">
                  <tr>
                    <th className="w-10 px-3 py-2">
                      <Checkbox
                        checked={visible.length > 0 && visible.every((row) => selected.has(row.expense.id))}
                        onCheckedChange={(value) => {
                          setSelected((current) => {
                            const next = new Set(current);
                            for (const row of visible) {
                              if (value) next.add(row.expense.id);
                              else next.delete(row.expense.id);
                            }
                            return next;
                          });
                        }}
                        aria-label="Select all"
                      />
                    </th>
                    <th className="px-3 py-2">Receipt</th>
                    <th className="px-3 py-2">Vendor and job</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e5e5e5]">
                  {visible.map((row) => (
                    <tr
                      key={row.expense.id}
                      className={cn(
                        "cursor-pointer hover:bg-[#faf9f7]",
                        open?.expense.id === row.expense.id && "bg-[#e4edfb]",
                      )}
                      onClick={() => onSelect(row.expense.id)}
                    >
                      <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(row.expense.id)}
                          onCheckedChange={(value) => toggle(row.expense.id, Boolean(value))}
                          aria-label={`Select ${row.expense.number}`}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-[#181818]">{row.expense.number}</p>
                        <p className="text-xs text-[#86827b]">{formatDate(row.expense.incurredAt)}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p>{row.expense.vendor || "No vendor"}</p>
                        <p className="text-xs text-[#86827b]">{row.job?.name || "Overhead"}</p>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(row.expense.amount)}</td>
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
            {pendingRows.length} awaiting approval ·{" "}
            {formatMoney(pendingRows.reduce((sum, row) => sum + row.expense.amount, 0))}
          </p>
        </section>

        <aside className="overflow-hidden rounded-sm border border-[#c9c9c9] bg-white shadow-[0_2px_2px_rgba(0,0,0,0.05)]">
          {!open ? (
            <p className="px-4 py-12 text-center text-sm text-[#706e6b]">Select an expense to review it.</p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-[#c9c9c9] bg-[#f3f3f3] px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#181818]">{open.expense.number}</h3>
                  <p className="mt-0.5 text-xs text-[#706e6b]">
                    {open.expense.vendor || "No vendor"}
                    {open.job ? ` — ${open.job.name}` : ""}
                  </p>
                </div>
                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CLASS[open.status])}>
                  {INVOICE_REVIEW_LABELS[open.status]}
                </span>
              </div>

              <div className="grid min-h-[32rem] lg:grid-cols-2">
                <div className="space-y-4 overflow-y-auto border-[#c9c9c9] px-4 py-4 lg:max-h-[80vh] lg:border-r">
                  <div>
                    <p className="text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">
                      Going to QuickBooks
                    </p>
                    <p className="mt-1 text-xs text-[#706e6b]">
                      {open.preview.txnType} · paid from {open.preview.payAccount}
                    </p>
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
                    <dt className="text-[#706e6b]">Payee</dt>
                    <dd className="text-right">{open.preview.vendor}</dd>
                    <dt className="text-[#706e6b]">Amount</dt>
                    <dd className="text-right tabular-nums">{formatMoney(open.preview.amount)}</dd>
                    <dt className="text-[#706e6b]">Date</dt>
                    <dd className="text-right">{formatDate(open.preview.txnDate)}</dd>
                    <dt className="text-[#706e6b]">Expense account</dt>
                    <dd className="text-right">{open.preview.accountName}</dd>
                    <dt className="text-[#706e6b]">Paid with</dt>
                    <dd className="text-right">{open.preview.paidWith}</dd>
                    <dt className="text-[#706e6b]">Customer:Job</dt>
                    <dd className="text-right font-mono text-xs">{open.preview.customerJob}</dd>
                    <dt className="text-[#706e6b]">Ref / memo</dt>
                    <dd className="text-right">{open.preview.memo}</dd>
                  </dl>

                  <ExpenseFields expenseId={open.expense.id} locked={open.status === "queued"} />

                  <div className="space-y-2">
                    <CheckRow ok={Boolean(open.expense.vendor.trim())} label={open.expense.vendor.trim() ? "Vendor is the QuickBooks payee" : "Add a vendor"} />
                    <CheckRow ok={open.expense.amount > 0} label={open.expense.amount > 0 ? "Amount is on the receipt" : "Enter the amount from the receipt"} />
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
                        onClick={() => void approve([open.expense.id])}
                      >
                        Approve and send
                      </Button>
                      <Button variant="outline" onClick={() => void hold(open.expense)}>
                        {open.status === "held" ? "Release hold" : "Hold"}
                      </Button>
                      {open.job ? (
                        <Button
                          nativeButton={false}
                          variant="outline"
                          render={<Link href={`/jobs?job=${open.job.id}&tab=financials`} />}
                        >
                          Open job
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>

                <ReceiptPane
                  url={open.expense.receiptUrl}
                  title={`Receipt · ${open.expense.vendor || open.expense.number}`}
                />
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function ReceiptPane({ url, title }: { url: string; title: string }) {
  if (!url) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center bg-[#faf9f7] px-4 text-center text-sm text-[#706e6b]">
        <FileText className="mb-2 size-7" />
        No PDF or photo on this expense.
      </div>
    );
  }
  return (
    <div className="flex min-h-[32rem] flex-col bg-[#faf9f7] lg:max-h-[80vh]">
      <div className="flex items-center justify-between border-b border-[#e8e5df] px-3 py-2">
        <p className="text-[11px] font-semibold tracking-wide text-[#706e6b] uppercase">Receipt</p>
        <a href={url} target="_blank" rel="noreferrer" className="text-xs font-medium text-[#0176d3] hover:underline">
          Open original
        </a>
      </div>
      {isReceiptPdf(url) ? (
        <iframe title={title} src={url} className="min-h-[32rem] flex-1 bg-white" />
      ) : (
        <a href={url} target="_blank" rel="noreferrer" className="flex flex-1 items-start justify-center p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={title} className="max-h-[70vh] w-full object-contain" />
        </a>
      )}
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

export function ExpenseReviewCountBadge({ className }: { className?: string }) {
  const crm = useCrm();
  const count = reviewableExpenses(crm.expenses).filter((expense) => expense.qbStatus !== "queued").length;
  if (!count) return null;
  return (
    <Badge variant="secondary" className={cn("ml-1 h-5 min-w-5 px-1.5 text-[11px]", className)}>
      {count}
    </Badge>
  );
}
