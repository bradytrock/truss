"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleAlert } from "lucide-react";
import { toast } from "sonner";
import { VendorPicker } from "@/components/vendor-picker";
import { CurrencyInput } from "@/components/currency-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { accCard, accRed, CountPill } from "@/components/accounting-chrome";
import { useCrm } from "@/lib/crm-store";
import {
  crmExpenseActors,
  expenseBlockedReason,
  expenseLoggedByLabel,
  expenseQbPayWith,
  expenseReviewStatus,
  reviewableExpenses,
  type InvoiceReviewStatus,
} from "@/lib/accounting-books";
import { formatMoney } from "@/lib/format";
import { moneyAmount } from "@/lib/money-input";
import { isReceiptPdf } from "@/lib/qb-review";
import { matchVendorName, vendorChoices } from "@/lib/qb-vendors";
import { expenseCategoriesOrDefaults, expenseChartAccount } from "@/lib/expense-categories";
import { ExpenseCategorySelect } from "@/components/expense-category-select";
import { cn } from "@/lib/utils";
import {
  EXPENSE_METHOD_LABELS,
  EXPENSE_METHODS,
  type Expense,
  type ExpenseMethod,
  type Job,
} from "@/lib/types";

const STATUS_PILL: Record<InvoiceReviewStatus, string> = {
  ready: "bg-[#e7f6ea] text-[#217a45]",
  needs_review: "bg-[#f8ead3] text-[#9a6230]",
  held: "bg-[#eceae6] text-[#5c5854]",
  queued: "bg-[#eceae6] text-[#5c5854]",
};

export function AccountingExpenseReview({
  selectedId,
  onSelect,
}: {
  selectedId?: string | null;
  onSelect: (expenseId: string | null) => void;
}) {
  const crm = useCrm();
  const [pending, setPending] = useState(false);
  const actors = useMemo(() => crmExpenseActors(crm), [crm]);

  const rows = useMemo(() => {
    return reviewableExpenses(crm.expenses).map((expense) => {
      const job = expense.jobId ? crm.getJob(expense.jobId) : undefined;
      const blocked = expenseBlockedReason({
        expense,
        job,
        categories: expenseCategoriesOrDefaults(crm.expenseCategories),
      });
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
        loggedBy: expenseLoggedByLabel(expense.createdBy, actors),
        dateDiffers: datesDiffer(expense.createdAt, expense.incurredAt),
      };
    });
  }, [actors, crm]);

  const visible = rows.filter((row) => row.status !== "queued");
  const open = rows.find((row) => row.expense.id === selectedId) ?? visible[0] ?? rows[0] ?? null;
  const groups = groupByJob(visible);

  async function approve(id: string) {
    const row = rows.find((item) => item.expense.id === id);
    if (!row || row.status === "held" || row.status === "needs_review") {
      toast.error(row?.blocked || "Fix this expense before it can go to QuickBooks.");
      return false;
    }
    setPending(true);
    try {
      const done = await crm.setQbStatus("expense", id, "queued");
      if (done) toast.success(`${row.expense.number} is in the Web Connector queue.`);
      return Boolean(done);
    } finally {
      setPending(false);
    }
  }

  async function approveAndNext() {
    if (!open) return;
    const index = visible.findIndex((row) => row.expense.id === open.expense.id);
    const next = visible[index + 1] ?? visible[index - 1];
    const ok = await approve(open.expense.id);
    if (ok) onSelect(next && next.expense.id !== open.expense.id ? next.expense.id : null);
  }

  function skip() {
    if (!open) return;
    const index = visible.findIndex((row) => row.expense.id === open.expense.id);
    const next = visible[index + 1] ?? visible[0];
    if (next && next.expense.id !== open.expense.id) onSelect(next.expense.id);
  }

  async function hold(expense: Expense) {
    const next = expense.qbStatus === "returned" ? "not_in_qb" : "returned";
    const ok = await crm.setQbStatus("expense", expense.id, next);
    if (ok) toast.success(next === "returned" ? `${expense.number} is on hold.` : `${expense.number} released.`);
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[18rem_minmax(0,1fr)_22rem]">
      <section className={cn(accCard, "max-h-[calc(100vh-11rem)] overflow-y-auto")}>
        <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
          <p className="text-sm font-semibold">{visible.length} to review</p>
          <p className="text-xs text-[#8a847c]">Grouped by job</p>
        </div>
        {groups.length === 0 ? (
          <p className="px-4 py-10 text-sm text-[#8a847c]">Every expense in this view is approved and queued.</p>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="pb-2">
              <div className="flex items-baseline justify-between px-4 py-2">
                <p className="text-sm font-medium">{group.label}</p>
                <p className="text-xs text-[#8a847c] tabular-nums">{formatMoney(group.total)}</p>
              </div>
              <ul>
                {group.rows.map((row) => {
                  const active = open?.expense.id === row.expense.id;
                  return (
                    <li key={row.expense.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(row.expense.id)}
                        className={cn(
                          "flex w-full items-start justify-between gap-3 border-l-2 px-4 py-2.5 text-left",
                          active ? "border-l-[#c43832] bg-[#fbf6ee]" : "border-l-transparent hover:bg-[#faf9f7]",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{row.expense.vendor || "No vendor"}</span>
                          <span className="mt-0.5 block text-xs text-[#8a847c]">
                            {row.expense.number} · {shortDate(row.expense.incurredAt)}
                            {row.dateDiffers ? <span className="ml-2 font-medium text-[#c43832]">Date differs</span> : null}
                            {row.status === "held" ? <span className="ml-2">Held</span> : null}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-medium tabular-nums">{formatMoney(row.expense.amount)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>

      <ReceiptStage
        url={open?.expense.receiptUrl ?? ""}
        title={
          open
            ? `Receipt · ${open.expense.invoiceNumber.trim() ? `Invoice ${open.expense.invoiceNumber.trim()}` : open.expense.number}`
            : "Receipt"
        }
      />

      <ExpenseDetail
        row={open}
        pending={pending}
        onApprove={() => void approveAndNext()}
        onHold={() => open && void hold(open.expense)}
        onSkip={skip}
      />
    </div>
  );
}

type ExpenseRow = {
  expense: Expense;
  job: Job | undefined;
  blocked: string | null;
  status: InvoiceReviewStatus;
  customer: string;
  loggedBy: string;
  dateDiffers: boolean;
};

function groupByJob(rows: ExpenseRow[]) {
  const order: string[] = [];
  const groups = new Map<string, { key: string; label: string; total: number; rows: ExpenseRow[] }>();
  for (const row of rows) {
    const key = row.job?.id ?? "none";
    let group = groups.get(key);
    if (!group) {
      const label = row.job
        ? `${row.customer || row.job.name}${row.job.code ? ` · ${row.job.code}` : ""}`
        : "No job";
      group = { key, label, total: 0, rows: [] };
      groups.set(key, group);
      order.push(key);
    }
    group.rows.push(row);
    group.total += row.expense.amount;
  }
  return order.map((key) => groups.get(key)!);
}

function ExpenseDetail({
  row,
  pending,
  onApprove,
  onHold,
  onSkip,
}: {
  row: ExpenseRow | null;
  pending: boolean;
  onApprove: () => void;
  onHold: () => void;
  onSkip: () => void;
}) {
  const crm = useCrm();
  if (!row) {
    return <aside className={cn(accCard, "px-5 py-16 text-center text-sm text-[#8a847c]")}>Select an expense to review it.</aside>;
  }
  const { expense, job, customer, status } = row;
  const locked = status === "queued";
  const vendors = vendorChoices(crm.qbVendors ?? [], crm.expenses);
  const categories = expenseCategoriesOrDefaults(crm.expenseCategories);
  const chart = expenseChartAccount(expense.account, categories);
  const jobs = crm.jobs.filter((item) => !item.deletedAt);
  const payNoun = expenseQbPayWith(expense.method) === "credit_card" ? "a credit card charge" : "a vendor bill";
  const where = job
    ? `${customer || job.name}${job.code ? ` · ${job.code}` : ""}`
    : "company overhead";
  const blocked = status === "needs_review" || status === "held";

  return (
    <aside className={cn(accCard, "max-h-[calc(100vh-11rem)] overflow-y-auto p-5")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-[#6f6a64]">
          {expense.number} · logged by {row.loggedBy}
        </p>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", STATUS_PILL[status])}>
          {status === "needs_review" ? "Needs review" : status === "held" ? "Held" : status === "queued" ? "Queued" : "Ready"}
        </span>
      </div>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">
        {expense.vendor || "No vendor"} · {formatMoney(expense.amount)}
      </h2>
      <p className="mt-3 rounded-xl bg-[#f6f4f0] px-3 py-2.5 text-sm leading-relaxed text-[#3c3a37]">
        Posts {payNoun} to {expense.vendor || "the vendor"} for {formatMoney(expense.amount)} on {where} under{" "}
        {chart.number} · {chart.name}, paid by {EXPENSE_METHOD_LABELS[expense.method]}.
      </p>

      <ul className="mt-4 space-y-2 text-sm">
        <li className="flex items-start gap-2">
          <Check className="mt-0.5 size-4 text-[#217a45]" />
          <span>{expense.amount > 0 ? "Amount matches receipt total" : "Enter the amount from the receipt"}</span>
        </li>
        <li className="flex items-start gap-2">
          {expense.invoiceNumber.trim() ? (
            <Check className="mt-0.5 size-4 text-[#217a45]" />
          ) : (
            <CircleAlert className="mt-0.5 size-4 text-[#c4842a]" />
          )}
          <span>
            {expense.invoiceNumber.trim()
              ? `Invoice # ${expense.invoiceNumber.trim()} matches receipt`
              : "No invoice number — QuickBooks will use the expense number"}
          </span>
        </li>
        {row.dateDiffers ? (
          <li className="flex items-start gap-2 text-[#9a6230]">
            <CircleAlert className="mt-0.5 size-4" />
            <span>
              Logged {slashDate(expense.createdAt)}, entered as {slashDate(expense.incurredAt)}
            </span>
          </li>
        ) : null}
        {row.blocked && status !== "ready" ? (
          <li className="flex items-start gap-2 text-[#9a6230]">
            <CircleAlert className="mt-0.5 size-4" />
            <span>{row.blocked}</span>
          </li>
        ) : null}
      </ul>

      <div className="mt-4 space-y-3">
        <Field label="Vendor">
          <VendorPicker
            value={expense.vendor}
            names={vendors.fromQb.map((item) => item.name)}
            extraNames={vendors.extras}
            onChange={(vendor) => {
              const next = matchVendorName(vendor, [...vendors.fromQb.map((item) => item.name), ...vendors.extras]);
              if (!locked) void crm.updateExpense(expense.id, { vendor: next || vendor });
            }}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <CurrencyInput
              value={expense.amount}
              disabled={locked}
              onCommit={(text) => {
                const amount = moneyAmount(text);
                if (amount != null && amount !== expense.amount) void crm.updateExpense(expense.id, { amount });
              }}
            />
          </Field>
          <Field label="Date">
            <Input
              type="date"
              key={`${expense.id}:${expense.incurredAt}`}
              defaultValue={expense.incurredAt.slice(0, 10)}
              disabled={locked}
              className={cn(row.dateDiffers && "border-[#e0a15a] bg-[#fff8ef]")}
              onBlur={(event) => {
                if (event.target.value && event.target.value !== expense.incurredAt.slice(0, 10)) {
                  void crm.updateExpense(expense.id, { incurredAt: event.target.value });
                }
              }}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Invoice #">
            <Input
              key={`${expense.id}:${expense.invoiceNumber}`}
              defaultValue={expense.invoiceNumber}
              disabled={locked}
              onBlur={(event) => {
                const invoiceNumber = event.target.value.trim();
                if (invoiceNumber !== expense.invoiceNumber) void crm.updateExpense(expense.id, { invoiceNumber });
              }}
            />
          </Field>
          <Field label="Paid with">
            <Select
              value={expense.method}
              disabled={locked}
              onValueChange={(value) => {
                if (value) void crm.updateExpense(expense.id, { method: value as ExpenseMethod });
              }}
              items={EXPENSE_METHODS.map((item) => ({ value: item, label: EXPENSE_METHOD_LABELS[item] }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_METHODS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {EXPENSE_METHOD_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Expense account">
          <ExpenseCategorySelect
            value={expense.account}
            disabled={locked}
            showChart
            onValueChange={(value) => {
              void crm.updateExpense(expense.id, { account: value });
            }}
          />
          <Link href="/accounting?tab=categories" className="mt-1.5 inline-block text-xs font-medium text-[#c43832] hover:underline">
            Change where categories post
          </Link>
        </Field>
        <Field label="Customer · Job">
          <Select
            value={expense.jobId ?? "none"}
            disabled={locked}
            onValueChange={(value) => {
              if (!value) return;
              void crm.updateExpense(expense.id, { jobId: value === "none" ? null : value });
            }}
            items={[
              { value: "none", label: "No job" },
              ...jobs.map((item) => ({
                value: item.id,
                label: jobOption(item, crm),
              })),
            ]}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No job</SelectItem>
              {jobs.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {jobOption(item, crm)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {locked ? (
        <p className="mt-4 text-sm text-[#6f6a64]">Queued for the next Web Connector poll.</p>
      ) : (
        <div className="mt-4 flex gap-2">
          <Button className={cn("h-11 flex-1 rounded-xl", accRed)} disabled={pending || blocked} onClick={onApprove}>
            Approve and next
          </Button>
          <Button variant="outline" className="h-11 rounded-xl px-4" onClick={onHold}>
            {status === "held" ? "Release" : "Hold"}
          </Button>
          <Button variant="outline" className="h-11 rounded-xl px-4" onClick={onSkip}>
            Skip
          </Button>
        </div>
      )}
      {job ? (
        <Link href={`/jobs?job=${job.id}&tab=financials`} className="mt-3 block text-center text-xs text-[#c43832] hover:underline">
          Open job
        </Link>
      ) : null}
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-[#8a847c]">{label}</span>
      {children}
    </label>
  );
}

function ReceiptStage({ url, title }: { url: string; title: string }) {
  return (
    <section className="flex min-h-[36rem] flex-col overflow-hidden rounded-3xl bg-[#1c1c1c] text-white">
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <p className="truncate font-medium">{title}</p>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="shrink-0 text-sm underline-offset-2 hover:underline">
            Open original
          </a>
        ) : null}
      </div>
      <div className="relative flex flex-1 items-center justify-center px-6">
        {url ? <Zoomable key={url} url={url} title={title} /> : <p className="text-sm text-white/70">[Receipt photo, zoomable]</p>}
      </div>
      <p className="px-4 py-3 text-center text-xs text-white/60">Scroll to zoom · Drag to pan</p>
    </section>
  );
}

function Zoomable({ url, title }: { url: string; title: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const node = frame.current;
    if (!node || isReceiptPdf(url)) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      setScale((current) => Math.min(4, Math.max(1, current + (event.deltaY < 0 ? 0.15 : -0.15))));
    }
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [url]);

  if (isReceiptPdf(url)) {
    return <iframe title={title} src={url} className="h-full min-h-[32rem] w-full bg-[#f6f4f0]" />;
  }

  return (
    <div
      ref={frame}
      className="flex h-full min-h-[28rem] w-full cursor-grab items-center justify-center overflow-hidden active:cursor-grabbing"
      onPointerDown={(event) => {
        drag.current = { x: event.clientX, y: event.clientY, ox: origin.x, oy: origin.y };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        setOrigin({
          x: drag.current.ox + event.clientX - drag.current.x,
          y: drag.current.oy + event.clientY - drag.current.y,
        });
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={title}
        draggable={false}
        className="max-h-[70vh] max-w-full object-contain"
        style={{ transform: `translate(${origin.x}px, ${origin.y}px) scale(${scale})` }}
      />
    </div>
  );
}

function jobOption(job: Job, crm: ReturnType<typeof useCrm>) {
  const customer = crm.customerName({
    jobId: job.id,
    clientId: job.clientId,
    primaryContactId: job.primaryContactId,
    opportunityId: job.opportunityId,
  });
  return `${customer || job.name}${job.code ? ` · ${job.code}` : ""}`;
}

function datesDiffer(createdAt: string, incurredAt: string) {
  const logged = createdAt.slice(0, 10);
  const entered = incurredAt.slice(0, 10);
  return Boolean(logged && entered && logged !== entered);
}

function shortDate(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) return iso;
  const stamp = new Date(Number(year), Number(month) - 1, Number(day));
  return stamp.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function slashDate(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) return iso;
  return `${month}/${day}/${year}`;
}

export function ExpenseReviewCountBadge({ className }: { className?: string }) {
  const crm = useCrm();
  const count = reviewableExpenses(crm.expenses).filter((expense) => expense.qbStatus !== "queued").length;
  if (!count) return null;
  return <CountPill className={className}>{count}</CountPill>;
}
