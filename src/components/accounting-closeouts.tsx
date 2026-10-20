"use client";

import { useState } from "react";
import Link from "next/link";
import { CommissionSheetView } from "@/components/commission-sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
  applyExpenseDisposition,
  blankQbLine,
  blankSplitLine,
  buildCommissionSheet,
  closeoutReleaseBlock,
  mergePostedBills,
  payoutRecipients,
  setDeductionAmount,
  type CommissionCloseout,
  type CommissionSheet,
} from "@/lib/commission-closeout";
import { downloadCloseoutPdf } from "@/lib/commission-closeout-pdf";
import { expensesForJob, forecastedExpensesForJob, paymentsForJob } from "@/lib/job-financials";
import { jobRecordHref } from "@/lib/job-record";
import { formatDate, formatMoney, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Expense, ForecastedExpense, Job } from "@/lib/types";

const GROUPS: Array<{ status: CommissionCloseout["status"]; label: string }> = [
  { status: "submitted", label: "With accounting" },
  { status: "returned", label: "Sent back" },
  { status: "released", label: "Released" },
  { status: "payout", label: "Marked for payout" },
];

export function CloseoutCountBadge() {
  const crm = useCrm();
  const waiting = (crm.commissionCloseouts ?? []).filter((item) => item.status === "submitted").length;
  if (!waiting) return null;
  return <CountPill>{waiting}</CountPill>;
}

export function AccountingCloseouts({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const crm = useCrm();
  const rows = [...(crm.commissionCloseouts ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const selected = rows.find((item) => item.id === selectedId) ?? rows.find((item) => item.status === "submitted") ?? rows[0] ?? null;

  if (rows.length === 0) {
    return (
      <p className="text-sm text-[#6f6a64]">
        No closeouts yet. A project manager submits one from the job’s financials.
      </p>
    );
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]">
      <div className="space-y-5">
        {GROUPS.map((group) => {
          const items = rows.filter((item) => item.status === group.status);
          if (items.length === 0) return null;
          return (
            <section key={group.status}>
              <p className="px-1 text-[11px] font-semibold tracking-[0.14em] text-[#8a847c] uppercase">
                {group.label} · {items.length}
              </p>
              <ul className="mt-2 space-y-2">
                {items.map((closeout) => (
                  <CloseoutCard
                    key={closeout.id}
                    closeout={closeout}
                    active={selected?.id === closeout.id}
                    onSelect={() => onSelect(closeout.id)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {selected ? <CloseoutReview key={selected.id} closeout={selected} /> : null}
    </div>
  );
}

function CloseoutCard({
  closeout,
  active,
  onSelect,
}: {
  closeout: CommissionCloseout;
  active: boolean;
  onSelect: () => void;
}) {
  const crm = useCrm();
  const built = sheetFor(crm, closeout);
  const name = built?.sheet.customerName || built?.job.name || "Job";
  const check = built?.sheet.splitTotals.check ?? 0;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "w-full rounded-2xl border px-3 py-3 text-left",
          active ? "border-[#e7d3c4] bg-[#fbf6ee]" : "border-[#ece7e1] bg-white hover:bg-[#faf9f7]",
        )}
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">{lastName(name)}</span>
          {closeout.status === "submitted" ? (
            <span className="text-sm font-semibold tabular-nums">{formatMoney(check)}</span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs text-[#6f6a64]">
          {built?.job.code || built?.job.name || "Job"}
          {built?.job.projectManager ? ` · ${built.job.projectManager}` : ""}
        </span>
      </button>
    </li>
  );
}

function CloseoutReview({ closeout }: { closeout: CommissionCloseout }) {
  const crm = useCrm();
  const job = crm.getJob(closeout.jobId);
  const [qbLines, setQbLines] = useState(closeout.qbLines);
  const [splits, setSplits] = useState(closeout.splits);
  const [adjustments, setAdjustments] = useState(closeout.expenseAdjustments ?? []);
  const [ack, setAck] = useState(closeout.varianceAck);
  const [note, setNote] = useState(closeout.accountingNote);
  const [returnNote, setReturnNote] = useState("");
  const [returning, setReturning] = useState(false);
  const [editingSheet, setEditingSheet] = useState(false);
  const [recipientId, setRecipientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const editing = closeout.status === "submitted";
  const recipients = job ? payoutRecipients(crm.staff, job.projectManager, job.ownerStaffId) : [];
  const recipient =
    recipientId ||
    recipients.find((member) => member.id === job?.ownerStaffId)?.id ||
    recipients.find((member) => member.name.trim().toLowerCase() === (job?.projectManager ?? "").trim().toLowerCase())?.id ||
    recipients[0]?.id ||
    "";

  const client = job?.clientId ? crm.clients.find((item) => item.id === job.clientId) : null;
  const contact = job?.primaryContactId ? crm.contacts.find((item) => item.id === job.primaryContactId) : null;
  const opportunity = job?.opportunityId ? crm.opportunities.find((item) => item.id === job.opportunityId) : null;
  const claim = job ? ((crm.jobInsurance ?? []).find((item) => item.jobId === job.id) ?? null) : null;
  const expenses = job ? expensesForJob(job.id, crm.expenses) : [];
  const forecasts = job ? forecastedExpensesForJob(job.id, crm.forecastedExpenses ?? []) : [];
  const sheet = job
    ? buildCommissionSheet({
        job,
        client,
        contact,
        opportunity,
        claim,
        payments: paymentsForJob(job.id, crm.payments, crm.invoices),
        expenses,
        forecasts,
        qbLines: editing ? qbLines : closeout.qbLines,
        splits: editing ? splits : closeout.splits,
        expenseAdjustments: editing ? adjustments : closeout.expenseAdjustments,
        closingDate: job.substantialCompletion ?? closeout.submittedAt,
      })
    : null;

  if (!job || !sheet) {
    return <p className="text-sm text-[#6f6a64]">This closeout’s job is no longer on the book.</p>;
  }

  const review = {
    qbLines,
    splits,
    varianceAck: ack,
    accountingNote: note,
    notes: closeout.notes,
    expenseAdjustments: adjustments,
  };
  const block = editing ? closeoutReleaseBlock(sheet, ack) : null;
  const check = sheet.splitTotals.check;

  async function save() {
    setBusy(true);
    try {
      await crm.saveCommissionCloseoutReview(closeout.id, review);
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    if (!recipient) return;
    setBusy(true);
    try {
      await crm.releaseCommissionCloseout(closeout.id, recipient, review);
    } finally {
      setBusy(false);
    }
  }

  async function sendBack() {
    setBusy(true);
    try {
      await crm.returnCommissionCloseout(closeout.id, returnNote);
      setReturning(false);
    } finally {
      setBusy(false);
    }
  }

  async function pdf() {
    if (!sheet) return;
    setPdfBusy(true);
    try {
      await downloadCloseoutPdf({ sheet, closeout, company: crm.company });
    } finally {
      setPdfBusy(false);
    }
  }

  const sold = sheet.jobSold;
  const cost = sheet.totalExpenses;
  const commission = Math.max(0, check);
  const base = sold > 0 ? sold : Math.max(cost + commission, 1);
  const rawCost = Math.max(cost, 0) / base;
  const rawComm = commission / base;
  const rawCo = Math.max(base - Math.max(cost, 0) - commission, 0) / base;
  const sum = rawCost + rawComm + rawCo || 1;
  const segments = [
    { label: "Job cost", pct: rawCost / sum, className: "bg-[#c4b6a6] text-[#3d342c]" },
    { label: "Commission", pct: rawComm / sum, className: "bg-[#c43832] text-white" },
    { label: "Company", pct: rawCo / sum, className: "bg-[#161616] text-white" },
  ];
  const paymentCount = sheet.payments.length + sheet.hiddenPayments;
  const paidFull = sold > 0 && sheet.totalPayments + 0.005 >= sold;
  const expenseCount = expenses.filter((item) => (adjustments.find((line) => line.expenseId === item.id)?.disposition ?? "job") === "job").length;
  const variance = explainVariance(sheet, expenses, forecasts);
  const companyKeeps = Math.max(0, sheet.profit - check);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[#6f6a64]">
            Commission closeout · submitted by {closeout.submittedByName || "the project manager"} · {formatDate(closeout.submittedAt)}
          </p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight">{sheet.customerName}</h2>
          <p className="mt-1 text-sm text-[#6f6a64]">
            {sheet.projectAddress || job.name}
            {job.code ? (
              <>
                {" · "}
                <Link href={jobRecordHref(job.id, { tab: "financials" })} className="font-medium text-[#c43832] hover:underline">
                  {job.code}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-10 rounded-xl" disabled={pdfBusy} onClick={() => void pdf()}>
            Closeout PDF
          </Button>
          {editing ? (
            <Button type="button" variant="outline" className="h-10 rounded-xl" disabled={busy} onClick={() => setReturning((value) => !value)}>
              Send back
            </Button>
          ) : null}
          {editing ? (
            <Button type="button" className={cn("h-10 rounded-xl px-4", accRed)} disabled={busy || !recipient || Boolean(block)} onClick={() => void release()}>
              Release {formatMoney(check)} for payout
            </Button>
          ) : null}
        </div>
      </div>

      {returning ? (
        <div className={cn(accCard, "flex flex-wrap items-end gap-2 p-3")}>
          <Textarea
            value={returnNote}
            onChange={(event) => setReturnNote(event.target.value)}
            placeholder="What needs to change"
            aria-label="Reason for sending the closeout back"
            className="min-w-64 flex-1"
          />
          <Button type="button" variant="outline" disabled={busy} onClick={() => void sendBack()}>
            Send back to the PM
          </Button>
        </div>
      ) : null}

      {editing && block ? (
        <label className="flex items-start gap-2 text-sm text-[#6f6a64]">
          <Checkbox checked={ack} onCheckedChange={(checked) => setAck(checked === true)} aria-label="Acknowledge cost differences" />
          <span>{block}</span>
        </label>
      ) : null}

      <section className={cn(accCard, "p-5")}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Sold & collected"
            value={formatMoney(sheet.totalPayments || sold)}
            hint={`${paymentCount || "No"} ${paymentCount === 1 ? "payment" : "payments"}${paidFull ? ", paid in full" : ""}`}
          />
          <Metric label="Job cost" value={formatMoney(cost)} hint={`${expenseCount} expense${expenseCount === 1 ? "" : "s"}`} />
          <Metric
            label="Actual profit"
            value={formatMoney(sheet.actualProfit)}
            hint={sheet.margin == null ? "—" : `${(sheet.margin * 100).toFixed(1)}% margin`}
          />
          <Metric
            label="vs. estimate"
            value={sheet.profitDifference == null ? "—" : formatMoney(sheet.profitDifference)}
            hint={
              sheet.estProfit == null
                ? "No forecast on the job"
                : `Est. ${formatMoney(sheet.estProfit)}${sold > 0 ? ` (${((sheet.estProfit / sold) * 100).toFixed(1)}%)` : ""}`
            }
            warn={sheet.profitDifference != null && sheet.profitDifference < 0}
          />
        </div>
        <div className="mt-5 flex h-9 overflow-hidden rounded-lg text-[11px] font-semibold">
          {segments.map((segment) =>
            segment.pct < 0.02 ? null : (
              <div
                key={segment.label}
                className={cn("flex items-center justify-center px-2", segment.className)}
                style={{ width: `${segment.pct * 100}%` }}
              >
                {segment.pct > 0.12 ? `${segment.label} ${Math.round(segment.pct * 100)}%` : null}
              </div>
            ),
          )}
        </div>
        {variance ? (
          <p className="mt-4 rounded-xl bg-[#fbf1df] px-4 py-3 text-sm leading-relaxed text-[#8a5a22]">{variance}</p>
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={cn(accCard, "overflow-hidden")}>
          <h3 className="px-4 pt-4 text-base font-semibold">Job cost</h3>
          <ul className="mt-2">
            {expenses.map((expense) => {
              const disposition = adjustments.find((line) => line.expenseId === expense.id)?.disposition ?? "job";
              if (disposition !== "job") return null;
              const forecasted = vendorInForecast(expense.vendor, forecasts);
              return (
                <li key={expense.id} className="flex items-center justify-between gap-3 border-t border-[#f3efe9] px-4 py-3 text-sm">
                  <span>
                    {expense.vendor || "Expense"}
                    {forecasted ? (
                      <span className="text-[#8a847c]"> · {shortAccount(expense.account)}</span>
                    ) : (
                      <span className="ml-2 rounded-full bg-[#f8e4cf] px-2 py-0.5 text-[11px] font-medium text-[#c47a32]">
                        not forecast
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums">{formatMoney(expense.amount)}</span>
                </li>
              );
            })}
            <li className="flex items-center justify-between border-t border-[#f3efe9] px-4 py-3 text-sm font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(cost)}</span>
            </li>
            {forecastGroups(forecasts).map((line) => (
              <li key={line.label} className="flex items-center justify-between px-4 py-2 text-sm text-[#8a847c]">
                <span>Forecast ({line.label})</span>
                <span className="tabular-nums">{formatMoney(line.amount)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={cn(accCard, "overflow-hidden")}>
          <h3 className="px-4 pt-4 text-base font-semibold">Commission</h3>
          <ul className="mt-2">
            <li className="flex items-center justify-between border-t border-[#f3efe9] px-4 py-3 text-sm">
              <span>Actual profit</span>
              <span className="tabular-nums">{formatMoney(sheet.actualProfit)}</span>
            </li>
            {sheet.splits.map((line) => {
              const show = line.id === "pm" || line.id === "advertising" || line.comm !== 0;
              if (!show || (line.trades > 0 && line.comm === 0)) return null;
              const label =
                line.id === "pm"
                  ? `Project manager${sheet.projectManager ? ` · ${sheet.projectManager}` : ""}${line.percent != null ? ` · ${line.percent}%` : ""}`
                  : line.label;
              return (
                <li key={line.id} className="flex items-center justify-between gap-3 border-t border-[#f3efe9] px-4 py-3 text-sm">
                  <span>{label}</span>
                  <span className="tabular-nums">{formatMoney(line.comm)}</span>
                </li>
              );
            })}
            {sheet.splitTotals.trades + sheet.splitTotals.draw !== 0 ? (
              <li className="flex items-center justify-between border-t border-[#f3efe9] px-4 py-3 text-sm">
                <span>Trades / draw</span>
                <span className="tabular-nums">{formatMoney(-(sheet.splitTotals.trades + sheet.splitTotals.draw))}</span>
              </li>
            ) : null}
            <li className="flex items-center justify-between border-t border-[#f3efe9] px-4 py-3 text-sm font-semibold">
              <span>Check</span>
              <span className="tabular-nums">{formatMoney(check)}</span>
            </li>
          </ul>
          <div className="flex items-center justify-between px-4 pb-4">
            <button type="button" className="text-sm font-medium text-[#c43832] hover:underline" onClick={() => setEditingSheet((value) => !value)}>
              Edit splits
            </button>
            <span className="text-xs text-[#8a847c]">Company keeps {formatMoney(companyKeeps)}</span>
          </div>
        </section>
      </div>

      <section className={cn(accCard, "grid gap-4 px-4 py-4 sm:grid-cols-5")}>
        <Meta label="Phone" value={sheet.phone ? formatPhone(sheet.phone) : "—"} />
        <Meta
          label="Email"
          value={
            sheet.email ? (
              sheet.email
            ) : contact ? (
              <Link href={`/contacts?contact=${contact.id}`} className="font-medium text-[#c43832] hover:underline">
                Add email
              </Link>
            ) : (
              "—"
            )
          }
        />
        <Meta label="PM / Lead" value={sheet.projectManager || sheet.lead || "—"} />
        <Meta label="Closed" value={formatDate(sheet.closingDate)} />
        <Meta label="Scope" value={claim ? `${claim.carrier || "Insurance"} claim` : "Retail · no insurance claim"} />
      </section>

      {!editing ? (
        <p className="text-sm text-[#6f6a64]">
          {closeout.status === "released"
            ? `With ${closeout.releasedToName || "the project manager"} for commission payout.`
            : closeout.status === "payout"
              ? `Marked for payout${closeout.payoutMarkedByName ? ` by ${closeout.payoutMarkedByName}` : ""}.`
              : "Sent back to the project manager."}
        </p>
      ) : null}

      {editingSheet ? (
        <div className="space-y-3">
          <CommissionSheetView
            sheet={sheet}
            closeout={{ ...closeout, accountingNote: editing ? "" : closeout.accountingNote }}
            editing={editing}
            qbLines={qbLines}
            varianceAck={ack}
            onVarianceAck={setAck}
            onSplit={(id, patch) => setSplits((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)))}
            onAddSplit={() => setSplits((current) => [...current, blankSplitLine(crypto.randomUUID())])}
            onRemoveSplit={(id) => setSplits((current) => current.filter((line) => line.id !== id))}
            onQb={(id, patch) => setQbLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)))}
            onAddQb={() => setQbLines((current) => [...current, blankQbLine(crypto.randomUUID())])}
            onRemoveQb={(id) => setQbLines((current) => current.filter((line) => line.id !== id))}
            onPullPosted={() => setQbLines((current) => mergePostedBills(current, expenses))}
            onExpenseDisposition={(expenseId, disposition) => {
              const expense = expenses.find((item) => item.id === expenseId);
              setAdjustments((current) => applyExpenseDisposition(current, expenseId, disposition, expense?.amount ?? 0));
            }}
            onDeductionAmount={(expenseId, amount) => setAdjustments((current) => setDeductionAmount(current, expenseId, amount))}
          />
          {editing ? (
            <div className={cn(accCard, "flex flex-wrap items-center gap-2 p-3")}>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Note on this review"
                aria-label="Accounting note"
                className="min-w-64 flex-1"
              />
              <Select
                value={recipient || undefined}
                onValueChange={(value) => {
                  if (value) setRecipientId(value);
                }}
                items={recipients.map((member) => ({ value: member.id, label: member.name }))}
              >
                <SelectTrigger className="w-56" aria-label="Project manager for payout">
                  <SelectValue placeholder="Project manager" />
                </SelectTrigger>
                <SelectContent>
                  {recipients.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void save()}>
                Save review
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, hint, warn }: { label: string; value: string; hint: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-sm text-[#6f6a64]">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tracking-tight tabular-nums", warn && "text-[#c43832]")}>{value}</p>
      <p className="mt-1 text-xs text-[#8a847c]">{hint}</p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-[#8a847c]">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}

function lastName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1]! : name;
}

function shortAccount(account: Expense["account"]) {
  if (account === "materials") return "materials";
  if (account === "subcontractors" || account === "labor") return "labor";
  if (account === "permits") return "fee";
  if (account === "dumpsters") return "disposal";
  if (account === "equipment_rental") return "equipment";
  return account.replaceAll("_", " ");
}

function vendorKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function vendorInForecast(vendor: string, forecasts: ForecastedExpense[]) {
  const key = vendorKey(vendor);
  return forecasts.some((item) => vendorKey(item.vendor) === key);
}

function forecastGroups(forecasts: ForecastedExpense[]) {
  const groups = new Map<string, { label: string; amount: number }>();
  for (const forecast of forecasts) {
    const key = vendorKey(forecast.vendor || "Forecast");
    const current = groups.get(key);
    if (current) current.amount += forecast.amount;
    else groups.set(key, { label: firstWord(forecast.vendor || "Forecast"), amount: forecast.amount });
  }
  return [...groups.values()];
}

function firstWord(value: string) {
  return value.trim().split(/\s+/)[0] || value;
}

function explainVariance(sheet: CommissionSheet, expenses: Expense[], forecasts: ForecastedExpense[]) {
  if (sheet.profitDifference == null || Math.abs(sheet.profitDifference) < 0.005) return null;
  const under = sheet.profitDifference < 0;
  const head = `Why profit came in ${formatMoney(Math.abs(sheet.profitDifference))} ${under ? "under" : "over"}.`;
  const forecastMap = new Map<string, { label: string; amount: number }>();
  for (const forecast of forecasts) {
    const key = vendorKey(forecast.vendor || "Forecast");
    const current = forecastMap.get(key);
    if (current) current.amount += forecast.amount;
    else forecastMap.set(key, { label: forecast.vendor || "Forecast", amount: forecast.amount });
  }
  const actualMap = new Map<string, { label: string; amount: number }>();
  for (const expense of expenses) {
    const key = vendorKey(expense.vendor || "Expense");
    const current = actualMap.get(key);
    if (current) current.amount += expense.amount;
    else actualMap.set(key, { label: expense.vendor || "Expense", amount: expense.amount });
  }
  const forecastOnly = [...forecastMap.values()];
  const missing = [...actualMap.entries()].filter(([key]) => !forecastMap.has(key)).map(([, row]) => row);
  const over = [...actualMap.entries()].flatMap(([key, actual]) => {
    const forecast = forecastMap.get(key);
    if (!forecast) return [];
    const delta = actual.amount - forecast.amount;
    if (delta > 0.5) return [{ label: firstWord(actual.label), delta }];
    return [];
  });
  const sentences = [head];
  if (forecastOnly.length) {
    const list = forecastOnly.map((row) => `${row.label} (${formatMoney(row.amount)})`).join(", ");
    sentences.push(`The estimate only forecast ${list}.`);
  }
  const tail: string[] = [];
  if (missing.length) {
    const list = missing.map((row) => `${row.label} (${formatMoney(row.amount)})`).join(" and ");
    tail.push(`${list} ${missing.length === 1 ? "wasn't" : "weren't"} in it`);
  }
  if (over.length) {
    tail.push(over.map((row) => `${row.label} ran ${formatMoney(row.delta)} over`).join(", "));
  }
  if (tail.length) sentences.push(`${tail.join(", and ")}.`);
  return sentences.join(" ");
}

function sheetFor(
  crm: ReturnType<typeof useCrm>,
  closeout: CommissionCloseout,
): { job: Job; sheet: CommissionSheet } | null {
  const job = crm.getJob(closeout.jobId);
  if (!job) return null;
  const client = job.clientId ? crm.clients.find((item) => item.id === job.clientId) : null;
  const contact = job.primaryContactId ? crm.contacts.find((item) => item.id === job.primaryContactId) : null;
  const opportunity = job.opportunityId ? crm.opportunities.find((item) => item.id === job.opportunityId) : null;
  const claim = (crm.jobInsurance ?? []).find((item) => item.jobId === job.id) ?? null;
  return {
    job,
    sheet: buildCommissionSheet({
      job,
      client,
      contact,
      opportunity,
      claim,
      payments: paymentsForJob(job.id, crm.payments, crm.invoices),
      expenses: expensesForJob(job.id, crm.expenses),
      forecasts: forecastedExpensesForJob(job.id, crm.forecastedExpenses ?? []),
      qbLines: closeout.qbLines,
      splits: closeout.splits,
      expenseAdjustments: closeout.expenseAdjustments,
      closingDate: job.substantialCompletion ?? closeout.submittedAt,
    }),
  };
}
