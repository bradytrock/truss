"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { accCard, accRed, CountPill } from "@/components/accounting-chrome";
import { useCrm } from "@/lib/crm-store";
import {
  daysPastDue,
  invoiceBlockedReason,
  invoiceReviewAmount,
  invoiceReviewStatus,
  reviewableInvoices,
  type InvoiceReviewStatus,
} from "@/lib/accounting-books";
import { formatCurrencyFull, formatMoney } from "@/lib/format";
import { jobAddress } from "@/lib/job-record";
import { invoiceTotal } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Invoice, Job, QbSyncStatus } from "@/lib/types";

const STATUS_PILL: Record<InvoiceReviewStatus, string> = {
  ready: "bg-[#e7f6ea] text-[#217a45]",
  needs_review: "bg-[#f8ead3] text-[#9a6230]",
  held: "bg-[#eceae6] text-[#5c5854]",
  queued: "bg-[#eceae6] text-[#5c5854]",
};

const STATUS_LABEL: Record<InvoiceReviewStatus, string> = {
  ready: "Ready",
  needs_review: "Needs review",
  held: "Held",
  queued: "Queued",
};

export function AccountingInvoiceReview({
  selectedId,
  onSelect,
}: {
  selectedId?: string | null;
  onSelect: (invoiceId: string | null) => void;
}) {
  const crm = useCrm();
  const [filter, setFilter] = useState<"all" | "past_due" | "held">("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const seeded = useRef(false);

  const rows = useMemo(() => {
    return reviewableInvoices(crm.invoices).map((invoice) => {
      const job = invoice.jobId ? crm.getJob(invoice.jobId) : undefined;
      const lines = crm.invoiceLines.filter((line) => line.invoiceId === invoice.id);
      const blocked = invoiceBlockedReason({ invoice, job, lines });
      const status = invoiceReviewStatus(invoice, blocked);
      const customer = crm.customerName(invoice);
      return {
        invoice,
        job,
        lines,
        blocked,
        status,
        amount: invoiceTotal(invoice.id, crm.invoiceLines),
        customer,
        address: shortAddress(job),
        pastDue: daysPastDue(invoice),
        placeholder: placeholderCustomer(customer),
        duplicateOf: duplicateNumber(invoice, crm.invoices),
      };
    });
  }, [crm]);

  useEffect(() => {
    if (seeded.current || rows.length === 0) return;
    seeded.current = true;
    setSelected(new Set(rows.filter((row) => row.status === "ready").map((row) => row.invoice.id)));
  }, [rows]);

  const pendingRows = rows.filter((row) => row.status !== "queued");
  const readyRows = pendingRows.filter((row) => row.status === "ready");
  const readyAmount = readyRows.reduce((sum, row) => sum + row.amount, 0);
  const reviewRows = pendingRows.filter((row) => row.status === "needs_review" || row.status === "held");
  const lateReady = readyRows.filter((row) => row.pastDue > 0);
  const lateAmount = lateReady.reduce((sum, row) => sum + row.amount, 0);

  const needle = query.trim().toLowerCase();
  const visible = pendingRows.filter((row) => {
    if (filter === "past_due" && row.pastDue <= 0) return false;
    if (filter === "held" && row.status !== "held") return false;
    if (!needle) return true;
    const hay = `${row.invoice.number} ${row.customer} ${row.address} ${row.job?.name ?? ""} ${row.invoice.name}`.toLowerCase();
    return hay.includes(needle);
  });
  const needs = visible.filter((row) => row.status === "needs_review" || row.status === "held");
  const ready = visible.filter((row) => row.status === "ready");
  const open = rows.find((row) => row.invoice.id === selectedId) ?? visible[0] ?? rows[0] ?? null;
  const readySelected = readyRows.filter((row) => selected.has(row.invoice.id));

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
      setSelected((current) => {
        const next = new Set(current);
        for (const id of ok) next.delete(id);
        return next;
      });
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
    <div className="space-y-4">
      <section className={cn(accCard, "flex flex-wrap items-end justify-between gap-4 px-5 py-4")}>
        <div className="flex flex-wrap gap-8">
          <Stat
            label="Ready to send"
            value={String(readyRows.length)}
            aside={formatCurrencyFull(readyAmount)}
          />
          <Stat label="Need review" value={String(reviewRows.length)} />
          <Stat
            label="Ready but past due"
            value={String(lateReady.length)}
            aside={lateReady.length ? formatCurrencyFull(lateAmount) : undefined}
            warn
          />
        </div>
        <Button
          className={cn("h-11 rounded-xl px-5", accRed)}
          disabled={pending || readySelected.length === 0}
          onClick={() => void approve(readySelected.map((row) => row.invoice.id))}
        >
          Approve {readySelected.length} ready and send
        </Button>
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.8fr)]">
        <section className={cn(accCard, "overflow-hidden")}>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by customer, address or INV #"
              aria-label="Filter invoices"
              className="h-10 min-w-56 flex-1 rounded-full border border-[#e6e1da] bg-[#faf9f7] px-4 text-sm outline-none placeholder:text-[#9a958e] focus:border-[#c8c2b8]"
            />
            <FilterPill active={filter === "all"} onClick={() => setFilter("all")}>
              All <span className="ml-1">{pendingRows.length}</span>
            </FilterPill>
            <FilterPill active={filter === "past_due"} onClick={() => setFilter("past_due")}>
              Past due
            </FilterPill>
            <FilterPill active={filter === "held"} onClick={() => setFilter("held")}>
              Held
            </FilterPill>
          </div>

          {visible.length === 0 ? (
            <p className="px-5 py-16 text-center text-sm text-[#8a847c]">Nothing in this view.</p>
          ) : (
            <div>
              {needs.length > 0 ? (
                <InvoiceGroup
                  title="Needs review"
                  count={needs.length}
                  rows={needs}
                  openId={open?.invoice.id}
                  selected={selected}
                  onToggle={toggle}
                  onSelect={onSelect}
                />
              ) : null}
              {ready.length > 0 ? (
                <InvoiceGroup
                  title="Ready"
                  count={ready.length}
                  rows={ready}
                  openId={open?.invoice.id}
                  selected={selected}
                  onToggle={toggle}
                  onSelect={onSelect}
                />
              ) : null}
            </div>
          )}
          <p className="border-t border-[#f0ece6] px-4 py-2.5 text-xs text-[#8a847c]">
            {pendingRows.length} awaiting approval ·{" "}
            {formatMoney(invoiceReviewAmount(pendingRows.map((row) => row.invoice), crm.invoiceLines))}
          </p>
        </section>

        <InvoiceDetail
          open={open}
          pending={pending}
          onApprove={() => open && void approve([open.invoice.id])}
          onHold={() => open && void hold(open.invoice)}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  aside,
  warn,
}: {
  label: string;
  value: string;
  aside?: string;
  warn?: boolean;
}) {
  return (
    <div>
      <p className="text-sm text-[#6f6a64]">{label}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className={cn("text-3xl font-semibold tracking-tight tabular-nums", warn ? "text-[#c43832]" : "text-[#1a1a1a]")}>
          {value}
        </span>
        {aside ? (
          <span className={cn("text-sm tabular-nums", warn ? "text-[#c43832]" : "text-[#6f6a64]")}>{aside}</span>
        ) : null}
      </p>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 rounded-full px-3.5 text-sm font-medium",
        active ? "bg-[#1c1c1c] text-white" : "bg-[#f3f1ec] text-[#3c3a37] hover:bg-[#eae7e1]",
      )}
    >
      {children}
    </button>
  );
}

type ReviewRow = {
  invoice: Invoice;
  job: Job | undefined;
  lines: { id: string }[];
  blocked: string | null;
  status: InvoiceReviewStatus;
  amount: number;
  customer: string;
  address: string;
  pastDue: number;
  placeholder: boolean;
  duplicateOf: string | null;
};

function InvoiceGroup({
  title,
  count,
  rows,
  openId,
  selected,
  onToggle,
  onSelect,
}: {
  title: string;
  count: number;
  rows: ReviewRow[];
  openId?: string;
  selected: Set<string>;
  onToggle: (id: string, on: boolean) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <p className="px-4 pt-2 pb-1 text-[11px] font-semibold tracking-[0.14em] text-[#8a847c] uppercase">
        {title} · {count}
      </p>
      <ul>
        {rows.map((row) => {
          const active = openId === row.invoice.id;
          const due = dueLabel(row.invoice);
          return (
            <li key={row.invoice.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(row.invoice.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(row.invoice.id);
                  }
                }}
                className={cn(
                  "flex w-full cursor-pointer items-start gap-3 border-l-2 px-4 py-3 text-left",
                  active ? "border-l-[#c43832] bg-[#fbf6ee]" : "border-l-transparent hover:bg-[#faf9f7]",
                )}
              >
                <span onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(row.invoice.id)}
                    onCheckedChange={(value) => onToggle(row.invoice.id, Boolean(value))}
                    aria-label={`Select ${row.invoice.number}`}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm">
                      <span className="font-semibold text-[#1a1a1a]">{row.invoice.number}</span>{" "}
                      <span className="font-semibold">{row.customer || "No customer"}</span>{" "}
                      <span className="text-[#6f6a64]">{row.address}</span>
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular-nums">{formatMoney(row.amount)}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className={row.pastDue > 0 ? "font-medium text-[#c43832]" : "text-[#8a847c]"}>
                      {due}
                      {row.pastDue > 0 ? ` · ${row.pastDue} days late` : ""}
                    </span>
                    {row.lines.length === 0 ? <Chip>No line items</Chip> : null}
                    {row.placeholder ? <Chip>Customer name is a placeholder</Chip> : null}
                    {row.duplicateOf ? <Chip>Marked &quot;copy&quot;; possible duplicate of {row.duplicateOf}</Chip> : null}
                    {row.status === "held" ? <Chip>Held</Chip> : null}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-[#f8ead3] px-2 py-0.5 text-[11px] font-medium text-[#9a6230]">{children}</span>
  );
}

function InvoiceDetail({
  open,
  pending,
  onApprove,
  onHold,
}: {
  open: ReviewRow | null;
  pending: boolean;
  onApprove: () => void;
  onHold: () => void;
}) {
  if (!open) {
    return (
      <aside className={cn(accCard, "px-5 py-16 text-center text-sm text-[#8a847c]")}>
        Select an invoice to review it.
      </aside>
    );
  }
  const blocked = open.status === "needs_review" || open.status === "held";
  const noLines = open.lines.length === 0;
  const salesRep = open.job?.salesRep.trim() || "";
  return (
    <aside className={cn(accCard, "p-5")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-[#6f6a64]">
          <span className="font-semibold text-[#1a1a1a]">{open.invoice.number}</span>
          {" · "}
          {open.invoice.name.trim() || statusWord(open.invoice.status)}
        </p>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", STATUS_PILL[open.status])}>
          {STATUS_LABEL[open.status]}
        </span>
      </div>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight">{open.customer || "No customer"}</h2>
      <p className="mt-1 text-sm text-[#6f6a64]">{open.address || open.job?.name || "No address"}</p>

      <dl className="mt-5 space-y-2.5 text-sm">
        <Row label="Job">
          {open.job ? (
            <Link href={`/jobs?job=${open.job.id}`} className="font-medium text-[#c43832] hover:underline">
              {open.job.code || open.job.name}
            </Link>
          ) : (
            <span className="text-[#c43832]">Assign a job</span>
          )}
        </Row>
        <Row label="Due">{dueLabel(open.invoice)}</Row>
        <Row label="Sales rep">
          <span className={salesRep ? "" : "text-[#c43832]"}>{salesRep || "Unassigned"}</span>
        </Row>
        <Row label="QuickBooks">{qbLabel(open.invoice.qbStatus)}</Row>
      </dl>

      <div className="mt-5 flex items-end justify-between border-t border-[#f0ece6] pt-4">
        <span className="text-sm text-[#6f6a64]">Total</span>
        <span className="text-2xl font-semibold tabular-nums">{formatMoney(open.amount)}</span>
      </div>

      <ul className="mt-4 space-y-2.5 text-sm">
        <CheckLine ok={Boolean(open.job)} label={open.job ? `Assigned to job ${open.job.code || open.job.name}` : "Assign this invoice to a job"} />
        <CheckLine
          ok={!noLines}
          label={
            noLines
              ? "No line items. QuickBooks won't accept a $0 invoice, and the connector won't guess amounts."
              : "Line items are on the invoice"
          }
        />
        {!salesRep ? <CheckLine ok={false} warn label="No sales rep assigned" /> : null}
        {open.status === "held" ? <CheckLine ok={false} warn label="Held — release before sending" /> : null}
        {open.blocked && open.lines.length > 0 && open.job ? <CheckLine ok={false} label={open.blocked} /> : null}
      </ul>

      {open.status === "queued" ? (
        <p className="mt-5 text-sm text-[#6f6a64]">Queued for the next Web Connector poll.</p>
      ) : (
        <div className="mt-5 space-y-2">
          {noLines || !open.job ? (
            <Button nativeButton={false} className={cn("h-11 w-full rounded-xl", accRed)} render={<Link href={`/invoices/${open.invoice.id}`} />}>
              {noLines ? "Add line items" : "Open invoice"}
            </Button>
          ) : (
            <Button className={cn("h-11 w-full rounded-xl", accRed)} disabled={pending || blocked} onClick={onApprove}>
              Approve and send
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-10 rounded-xl" onClick={onHold}>
              {open.status === "held" ? "Release hold" : "Hold"}
            </Button>
            {noLines || !open.job ? (
              <Button className="h-10 rounded-xl" variant="outline" disabled>
                Approve and send
              </Button>
            ) : (
              <Button nativeButton={false} variant="outline" className="h-10 rounded-xl" render={<Link href={`/invoices/${open.invoice.id}`} />}>
                Edit invoice
              </Button>
            )}
          </div>
          <p className="text-center text-xs text-[#8a847c]">
            {noLines
              ? "Approve unlocks once the invoice has line items."
              : !open.job
                ? "Assign a job before this can go to QuickBooks."
                : blocked
                  ? "Fix the invoice before it can go to QuickBooks."
                  : "Sending puts it on the next Web Connector poll."}
          </p>
        </div>
      )}
    </aside>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[#8a847c]">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function CheckLine({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <Check className="mt-0.5 size-4 shrink-0 text-[#217a45]" />
      ) : warn ? (
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-[#c4842a]" />
      ) : (
        <span className="mt-0.5 text-[#c43832]">×</span>
      )}
      <span>{label}</span>
    </li>
  );
}

function dueLabel(invoice: Invoice) {
  if (!invoice.dueAt) return "Due on receipt";
  const [year, month, day] = invoice.dueAt.slice(0, 10).split("-");
  if (!year || !month || !day) return `Due ${invoice.dueAt}`;
  const stamp = new Date(Number(year), Number(month) - 1, Number(day));
  return `Due ${stamp.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function statusWord(status: Invoice["status"]) {
  if (status === "draft") return "Draft";
  if (status === "partial") return "Partial invoice";
  if (status === "paid") return "Paid invoice";
  if (status === "overdue") return "Overdue invoice";
  if (status === "void") return "Void invoice";
  return "Sent invoice";
}

function qbLabel(status: QbSyncStatus) {
  if (status === "entered") return "In QuickBooks";
  if (status === "queued") return "Waiting for poll";
  if (status === "error") return "Rejected";
  if (status === "returned") return "On hold";
  return "Not sent yet";
}

function shortAddress(job: Job | undefined) {
  if (!job) return "";
  if (job.street.trim() && job.city.trim()) return `${job.street.trim()}, ${job.city.trim()}`;
  return jobAddress(job);
}

function placeholderCustomer(name: string) {
  const value = name.trim().toLowerCase();
  return !value || /^(homeowner|customer|client|tbd|unknown|n\/a|na|occupant|resident|placeholder)$/.test(value);
}

function duplicateNumber(invoice: Invoice, invoices: Invoice[]) {
  const blob = `${invoice.name} ${invoice.notes}`.toLowerCase();
  if (!blob.includes("copy")) return null;
  const sibling = invoices.find(
    (item) => item.id !== invoice.id && item.jobId && item.jobId === invoice.jobId && item.status !== "void",
  );
  return sibling?.number ?? null;
}

export function InvoiceReviewCountBadge({ className }: { className?: string }) {
  const crm = useCrm();
  const count = reviewableInvoices(crm.invoices).filter((invoice) => invoice.qbStatus !== "queued").length;
  if (!count) return null;
  return <CountPill className={className}>{count}</CountPill>;
}
