"use client";

import { useMemo, useState } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RefundProgress } from "@/components/refund-panels";
import { RefundRequestDialog } from "@/components/refund-request-dialog";
import { RefundReviewDialog } from "@/components/refund-review-dialog";
import { useCrm } from "@/lib/crm-store";
import { formatCurrencyFull, formatMoney } from "@/lib/format";
import { expensesForJob, paymentsForJob } from "@/lib/job-financials";
import { amountForEstimate, featuredEstimateForJob } from "@/lib/estimate-totals";
import {
  canProcessRefunds,
  isOpenRefund,
  jobRefundSnapshot,
  paymentDetail,
  paymentHeading,
  refundPayout,
  refundReasonLabel,
  refundWaitingCopy,
  refundWhen,
} from "@/lib/refunds";
import { cn } from "@/lib/utils";
import type { Job } from "@/lib/types";

export function JobRefundDesk({
  job,
  onLogPayment,
  onLogExpense,
  onLogForecast,
}: {
  job: Job;
  onLogPayment: () => void;
  onLogExpense: () => void;
  onLogForecast: () => void;
}) {
  const crm = useCrm();
  const [requestOpen, setRequestOpen] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const viewer = crm.effectiveStaff;
  const payments = useMemo(
    () => paymentsForJob(job.id, crm.payments, crm.invoices),
    [crm.invoices, crm.payments, job.id],
  );
  const expenses = useMemo(() => expensesForJob(job.id, crm.expenses), [crm.expenses, job.id]);
  const refunds = useMemo(
    () => (crm.refundRequests ?? []).filter((item) => item.jobId === job.id),
    [crm.refundRequests, job.id],
  );
  const openRefunds = refunds.filter(isOpenRefund);
  const snapshot = jobRefundSnapshot({ payments, expenses, refunds });
  const estimates = crm.estimates.filter((estimate) => estimate.jobId === job.id && !estimate.archivedAt);
  const featured = featuredEstimateForJob(estimates);
  const estimateTotal = featured
    ? amountForEstimate(featured, crm.estimateLines, job.market)
    : job.contractValue;
  const income = payments
    .filter((payment) => payment.amount > 0 && !/refund/i.test(payment.method))
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt));
  const activity = crm.activities
    .filter((item) => item.entityType === "job" && item.entityId === job.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 4);
  const canRequest = income.some((payment) => payment.amount > 0);

  return (
    <div className="space-y-4">
      {openRefunds.map((refund) => {
        const mine = viewer?.id === refund.requestedBy || viewer?.name === refund.requestedByName;
        const canWithdraw = (mine || canProcessRefunds(viewer?.role)) && (refund.status === "requested" || refund.status === "approved");
        const contact = crm.contacts.find((item) => item.id === job.primaryContactId);
        const client = crm.clients.find((item) => item.id === job.clientId);
        const customer = contact?.name.trim() || client?.name.trim() || "the customer";
        return (
          <section key={refund.id} className="rounded-2xl border border-[#f0e2c4] bg-[#fffaf3] px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#f4e4c8] text-[#9a6420]">
                  <Undo2 className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {refund.status === "requested"
                      ? "Refund pending approval"
                      : refund.status === "approved"
                        ? "Refund approved"
                        : "Refund processing"}{" "}
                    <span className="font-normal text-[#8a847c]">{refund.number}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-[#3f3c39]">
                    {formatMoney(refundPayout(refund))} to {customer}
                    {refund.destinationLabel ? `, ${refund.destinationLabel}` : ""} · {refundReasonLabel(refund.reason)}
                  </p>
                  <p className="mt-0.5 text-xs text-[#8a847c]">
                    Requested by {refund.requestedByName} {refundWhen(refund.requestedAt)} · {refundWaitingCopy(refund.status)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {canWithdraw ? (
                  <Button type="button" variant="outline" size="sm" className="rounded-lg bg-white" onClick={() => void crm.withdrawRefund(refund.id)}>
                    Withdraw
                  </Button>
                ) : null}
                <Button type="button" variant="outline" size="sm" className="rounded-lg bg-white" onClick={() => setReviewId(refund.id)}>
                  View request
                </Button>
              </div>
            </div>
            <div className="mt-3 pl-11">
              <RefundProgress status={refund.status} />
            </div>
          </section>
        );
      })}

      <div className="flex flex-wrap gap-2">
        <Button type="button" className="rounded-lg bg-[#c43832] text-white hover:bg-[#a82f2a]" onClick={onLogPayment}>
          + Log payment
        </Button>
        <Button type="button" variant="outline" className="rounded-lg" onClick={onLogExpense}>
          Log expense
        </Button>
        <Button type="button" variant="outline" className="rounded-lg" onClick={onLogForecast}>
          Log forecasted expense
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-lg"
          disabled={!canRequest}
          onClick={() => setRequestOpen(true)}
        >
          Request refund
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Estimate"
          value={formatCurrencyFull(estimateTotal)}
          hint={featured ? `${featured.number} · ${featured.status}` : "No estimate yet"}
        />
        <Stat
          label="Collected"
          value={formatCurrencyFull(snapshot.collected)}
          hint={snapshot.pendingPayout > 0 ? `${formatMoney(-snapshot.pendingPayout)} refund pending` : "Posted payments"}
          hintWarn={snapshot.pendingPayout > 0}
        />
        <Stat
          label="Expenses"
          value={formatCurrencyFull(snapshot.expenseTotal)}
          hint={expenses.length === 0 ? "None logged" : `${expenses.length} logged`}
        />
        <Stat
          label="Profit"
          value={formatCurrencyFull(snapshot.profit)}
          hint={
            snapshot.pendingPayout > 0
              ? `${formatMoney(snapshot.afterProfit)} after pending refund`
              : "After card fees and costs"
          }
          hintWarn={snapshot.pendingPayout > 0}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-[#ece7e1] bg-white">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="min-w-0 px-4 py-4">
            <p className="text-sm font-semibold">Income</p>
            {income.length === 0 ? (
              <p className="mt-3 text-sm text-[#6f6a64]">No payments on this job yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-[#f0ece7]">
                {income.map((payment) => {
                  const pending = openRefunds.filter((refund) => refund.paymentId === payment.id);
                  const pendingAmount = pending.reduce((sum, refund) => sum + refundPayout(refund), 0);
                  const done = refunds.filter((refund) => refund.paymentId === payment.id && refund.status === "refunded");
                  return (
                    <li key={payment.id} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {paymentHeading(payment)}
                          {pending.length > 0 ? (
                            <span className="rounded-full bg-[#fbf1df] px-2 py-0.5 text-[11px] font-medium text-[#8a5a22]">
                              Refund pending
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-xs text-[#8a847c]">{paymentDetail(payment)}</p>
                        {done.length > 0 ? (
                          <p className="mt-1 text-xs text-[#6f6a64]">
                            Refunded {formatMoney(done.reduce((sum, refund) => sum + refundPayout(refund), 0))}
                          </p>
                        ) : null}
                      </div>
                      {pendingAmount > 0 ? (
                        <p className="shrink-0 text-sm font-medium text-[#c47b2b] tabular-nums">
                          −{formatMoney(pendingAmount)} pending
                        </p>
                      ) : (
                        <p className="shrink-0 text-sm tabular-nums">{formatMoney(payment.amount)}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="border-t border-[#f0ece7] px-4 py-4 text-sm lg:border-t-0 lg:border-l">
            <Row label="Payments received" value={formatMoney(snapshot.received)} />
            <Row label="Merchant fees (4%)" value={formatMoney(snapshot.fees)} />
            <Row
              label="Customer refund"
              value={
                snapshot.pendingPayout > 0
                  ? `${formatMoney(snapshot.refunded)} · ${formatMoney(snapshot.pendingPayout)} pending`
                  : formatMoney(snapshot.refunded)
              }
              warn={snapshot.pendingPayout > 0}
            />
            <div className="my-2 border-t border-[#f0ece7]" />
            <Row label="Total payments" value={formatMoney(snapshot.collected)} strong />
            {snapshot.pendingPayout > 0 ? (
              <Row label="After pending refund" value={formatMoney(snapshot.afterCollected)} />
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#ece7e1] bg-white px-4 py-4">
        <p className="text-sm font-semibold">Recent activity</p>
        {activity.length === 0 ? (
          <p className="mt-2 text-sm text-[#6f6a64]">Nothing on this job yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {activity.map((item) => (
              <li key={item.id} className="flex gap-2 text-sm text-[#3f3c39]">
                {item.body.toLowerCase().includes("refund") ? (
                  <Undo2 className="mt-0.5 size-3.5 shrink-0 text-[#c47b2b]" />
                ) : (
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#c9c3bb]" />
                )}
                <span>
                  {item.body} <span className="text-[#8a847c]">· {refundWhen(item.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <RefundRequestDialog
        key={requestOpen ? "refund-request-open" : "refund-request-closed"}
        job={job}
        open={requestOpen}
        onOpenChange={setRequestOpen}
      />
      <RefundReviewDialog
        key={reviewId ?? "closed"}
        refundId={reviewId}
        open={Boolean(reviewId)}
        onOpenChange={(next) => !next && setReviewId(null)}
      />
    </div>
  );
}

function Stat({ label, value, hint, hintWarn }: { label: string; value: string; hint: string; hintWarn?: boolean }) {
  return (
    <div className="rounded-2xl border border-[#ece7e1] bg-white px-4 py-3">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8a847c] uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className={cn("mt-1 text-xs", hintWarn ? "text-[#c47b2b]" : "text-[#8a847c]")}>{hint}</p>
    </div>
  );
}

function Row({ label, value, strong, warn }: { label: string; value: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-[#6f6a64]">{label}</span>
      <span className={cn("text-right tabular-nums", strong && "font-semibold text-[#1c1c1c]", warn && "text-[#c47b2b]")}>
        {value}
      </span>
    </div>
  );
}
